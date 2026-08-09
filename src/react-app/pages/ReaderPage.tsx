import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { getChapter, getBookCatalog } from "../data/api";
import { useApi } from "../hooks/useApi";
import type { ChapterDetail, BookCatalog, Gloss } from "../data/types";
import { Header } from "../components/Common/Header";
import { Loading } from "../components/Common/Loading";
import { GlossText } from "../components/Common/GlossText";
import { parseTermPinyin } from "../data/glossPinyin";
import { useBgm } from "../store/audioStore";
import { useAuth } from "../store/authStore";
import { getSave, patchSave } from "../services/authClient";
import type { ReadingProgressEntry, SaveConflictError, WorkSaveData } from "../types/auth";
import { useHighlights } from "../hooks/useHighlights";
import "../components/Search/lantai.css";

/** 浮动划线按钮的定位与选区信息 */
interface SelectionBox {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  passageId: string;
}

export default function ReaderPage() {
  useBgm("/assets/audio/classics.mp3", 0.12);
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = params["*"] || "";
  const targetPid = searchParams.get("p");
  const fromNotes = searchParams.get("from") === "notes";
  const fromProgress = searchParams.get("from") === "progress";
  /** 来源标记：仅人物生平跳转携带 from=figure，其余入栈路径（笔记/进度/兰台）均不触发背景高亮 */
  const fromFigure = searchParams.get("from") === "figure";
  /** 人物生平跳转携带的人物 id（仅 from=figure 时有值），用于返回人物生平 */
  const figureId = fromFigure ? searchParams.get("figure") : null;
  const { isAuthenticated } = useAuth();

  const { data, loading, error, refetch } = useApi<ChapterDetail>(
    () => getChapter(id),
    [id],
    `/api/chapters/${id}`,
  );

  // 侧栏目录：拿到 book_id 后加载全书篇目（非关键，失败不阻塞阅读）
  const bookId = data?.book_id;
  const { data: catalog } = useApi<BookCatalog | null>(
    () => (bookId ? getBookCatalog(bookId) : Promise.resolve(null)),
    [bookId],
    bookId ? `/api/books/${bookId}/catalog` : undefined,
  );

  // 划线笔记
  const {
    addHighlight,
    removeHighlight,
    getBookHighlights,
  } = useHighlights(isAuthenticated);

  const hasVernacular = useMemo(
    () => !!data?.passages.some((p) => p.vernacular),
    [data],
  );
  const hasAnnotation = useMemo(
    () => !!data?.passages.some((p) => p.annotation),
    [data],
  );

  /** 汇总本篇所有段落的词条，按 term 去重 */
  const chapterGlosses = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const all: Gloss[] = [];
    for (const p of data.passages) {
      if (!p.glosses) continue;
      for (const g of p.glosses) {
        if (!seen.has(g.term)) {
          seen.add(g.term);
          all.push(g);
        }
      }
    }
    return all;
  }, [data]);

  const [showVern, setShowVern] = useState(false);
  const [showAnnot, setShowAnnot] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);

  // ── 划线选区与笔记面板 ──
  const [selectionBox, setSelectionBox] = useState<SelectionBox>({
    visible: false, x: 0, y: 0, text: "", passageId: "",
  });
  const [notesOpen, setNotesOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [highlightToast, setHighlightToast] = useState<string | null>(null);
  const passagesContainerRef = useRef<HTMLDivElement>(null);

  /** 当前书的划线列表 */
  const bookHighlights = useMemo(
    () => (data ? getBookHighlights(data.book_id) : []),
    [data, getBookHighlights],
  );

  /** 当前篇的划线数 */
  const chapterHighlightCount = useMemo(
    () => (data ? bookHighlights.filter((h) => h.chapterId === data.id).length : 0),
    [data, bookHighlights],
  );

  /** 当前篇各段落的划线文本（按 passageId 分组，用于 GlossText 渲染下划线） */
  const passageHighlightTexts = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;
    for (const hl of bookHighlights) {
      if (hl.chapterId === data.id) {
        const arr = map.get(hl.passageId) || [];
        arr.push(hl.text);
        map.set(hl.passageId, arr);
      }
    }
    return map;
  }, [data, bookHighlights]);

  // 切换篇章后关闭抽屉；无锚点段落时回到页首
  useEffect(() => {
    if (!targetPid) window.scrollTo({ top: 0 });
    setSideOpen(false);
    setNotesOpen(false);
    setSelectionBox((s) => ({ ...s, visible: false }));
  }, [id, targetPid]);

  // 从人物生平跳转而来：定位到对应段落
  useEffect(() => {
    if (!data || !targetPid) return;
    const t = setTimeout(() => {
      const el = document.getElementById(targetPid);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => { clearTimeout(t); };
  }, [data, targetPid]);

  // 侧栏内把当前篇滚入视野
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [catalog, id]);

  // 记录阅读进度：用户翻开篇章即自动记录到云端存档（带防抖，合并快速翻篇的连续写入）
  useEffect(() => {
    if (!isAuthenticated || !data || !catalog) return;
    const chapterId = data.id;
    const bookIdForProgress = data.book_id;
    let cancelled = false;

    const recordProgress = async (attempt = 0) => {
      try {
        const res = await getSave();
        if (cancelled) return;
        const saveData: WorkSaveData = res.exists && res.save ? res.save : {};
        const readingProgress = saveData.readingProgress || {};
        const existing = readingProgress[bookIdForProgress] as ReadingProgressEntry | undefined;
        const readChapterIds = existing?.readChapterIds ? [...existing.readChapterIds] : [];

        if (!readChapterIds.includes(chapterId)) {
          readChapterIds.push(chapterId);
        }

        const totalChapters = catalog.chapters.length;
        const chaptersRead = readChapterIds.length;
        const progress = totalChapters > 0 ? Math.round((chaptersRead / totalChapters) * 100) : 0;

        const entry: ReadingProgressEntry = {
          bookId: bookIdForProgress,
          bookName: data.book_name,
          dynasty: catalog.book.dynasty,
          author: catalog.book.author,
          volumeCount: totalChapters,
          chapterId,
          chapterName: data.name,
          volumeNo: data.volume_no,
          progress,
          chaptersRead,
          readChapterIds,
          lastReadAt: Date.now(),
        };

        const newReadingProgress = {
          ...readingProgress,
          [bookIdForProgress]: entry,
        };

        // 字段级写入：只回传 readingProgress，避免整档往返（含 highlights 等大字段）
        await patchSave({ readingProgress: newReadingProgress }, Date.now(), "default", res.version);
      } catch (err) {
        // 冲突（版本被其他字段如划线写入推进）时重新拉取最新进度并重试，避免进度静默丢失
        const conflict = (err as SaveConflictError)?.error === "conflict";
        if (conflict && attempt < 2 && !cancelled) {
          return recordProgress(attempt + 1);
        }
        // 其余情况静默失败
      }
    };

    // 防抖 2s：快速翻篇时只写最后一次，减少整档写入与版本冲突
    const timer = setTimeout(recordProgress, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, data?.id, catalog]);

  // ── 文本选区检测：mouseup 后检测是否有有效选区 ──
  useEffect(() => {
    if (!data) return;

    const handleMouseUp = (e: MouseEvent) => {
      // 点击笔记面板或浮动按钮内部时不处理
      const target = e.target as HTMLElement;
      if (target.closest(".lt-notes-panel") || target.closest(".lt-highlight-btn")) {
        return;
      }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectionBox((s) => ({ ...s, visible: false }));
        return;
      }

      const text = sel.toString().trim();
      if (text.length < 2) {
        setSelectionBox((s) => ({ ...s, visible: false }));
        return;
      }

      // 确认选区在正文段落内
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const paraEl = container.nodeType === Node.ELEMENT_NODE
        ? (container as HTMLElement).closest(".lt-para")
        : container.parentElement?.closest(".lt-para");

      if (!paraEl) {
        setSelectionBox((s) => ({ ...s, visible: false }));
        return;
      }

      const passageId = paraEl.getAttribute("id") || "";
      if (!passageId) {
        setSelectionBox((s) => ({ ...s, visible: false }));
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelectionBox({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.top,
        text,
        passageId,
      });
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [data]);

  /** 点击浮动按钮：确认划线 */
  const handleConfirmHighlight = useCallback(async () => {
    if (!data || !selectionBox.visible) return;
    const ok = await addHighlight({
      bookId: data.book_id,
      bookName: data.book_name,
      chapterId: data.id,
      chapterName: data.name,
      volumeNo: data.volume_no,
      passageId: selectionBox.passageId,
      text: selectionBox.text,
    });

    // 清除选区
    window.getSelection()?.removeAllRanges();
    setSelectionBox((s) => ({ ...s, visible: false }));

    if (ok) {
      setHighlightToast("已划线");
      setTimeout(() => setHighlightToast(null), 1800);
      // 划线已通过乐观更新写入本地状态，无需再整档拉取（避免冗余网络往返）
    } else {
      setHighlightToast("划线失败或已存在");
      setTimeout(() => setHighlightToast(null), 1800);
    }
  }, [data, selectionBox, addHighlight]);

  /** 切换笔记面板时默认全选当前书的所有划线 */
  const toggleNotesPanel = useCallback(() => {
    setNotesOpen((prev) => {
      const next = !prev;
      if (next && data) {
        // 打开时默认全选
        const all = getBookHighlights(data.book_id);
        setCheckedIds(new Set(all.map((h) => h.id)));
      }
      return next;
    });
  }, [data, getBookHighlights]);

  /** 切换单条勾选 */
  const toggleCheck = useCallback((hlId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(hlId)) next.delete(hlId);
      else next.add(hlId);
      return next;
    });
  }, []);

  /** 全选/取消全选 */
  const toggleSelectAll = useCallback(() => {
    if (data) {
      const all = getBookHighlights(data.book_id);
      if (checkedIds.size === all.length) {
        setCheckedIds(new Set());
      } else {
        setCheckedIds(new Set(all.map((h) => h.id)));
      }
    }
  }, [data, getBookHighlights, checkedIds.size]);

  /** 复制已选划线到剪贴板 */
  const handleCopyHighlights = useCallback(() => {
    if (!data) return;
    const all = getBookHighlights(data.book_id);
    const selected = all.filter((h) => checkedIds.has(h.id));
    if (selected.length === 0) return;

    const text = selected
      .map((h) => `《${h.bookName}》卷${h.volumeNo} · ${h.chapterName}\n${h.text}`)
      .join("\n\n————\n\n");

    navigator.clipboard.writeText(text).then(() => {
      setHighlightToast(`已复制 ${selected.length} 条划线`);
      setTimeout(() => setHighlightToast(null), 1800);
    });
  }, [data, getBookHighlights, checkedIds]);

  /** 导出已选划线为 txt 文件 */
  const handleExportHighlights = useCallback(() => {
    if (!data) return;
    const all = getBookHighlights(data.book_id);
    const selected = all.filter((h) => checkedIds.has(h.id));
    if (selected.length === 0) return;

    const lines = selected.map((h, i) =>
      `${i + 1}. 《${h.bookName}》卷${h.volumeNo} · ${h.chapterName}\n   ${h.text}`,
    );
    const content = `《${data.book_name}》划线笔记\n共 ${selected.length} 条\n\n${lines.join("\n\n")}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.book_name}_划线笔记.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, getBookHighlights, checkedIds]);

  /** 删除单条划线 */
  const handleRemoveHighlight = useCallback(async (hlId: string) => {
    if (!data) return;
    await removeHighlight(hlId, data.book_id);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.delete(hlId);
      return next;
    });
  }, [data, removeHighlight]);

  /** 点击笔记条目：跳转到文中对应段落（支持跨卷跳转）
   *  仅当当前就是从读书笔记/阅读进度页进入时，跨卷跳转才保留来源标记；
   *  在兰台模块内阅读时点击笔记，跳转不显示返回按钮 */
  const handleNoteJump = useCallback((chapterId: string, passageId: string) => {
    if (chapterId !== id) {
      const from = fromNotes ? "notes" : fromProgress ? "progress" : null;
      navigate(`/read/${chapterId}?p=${passageId}${from ? `&from=${from}` : ""}`);
    } else {
      // 同卷：平滑滚动到对应段落
      const el = document.getElementById(passageId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [id, navigate, fromNotes, fromProgress]);

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <div className="lt-reader">
        <Header />
        <div className="lt-reader-inner">
          <Link to="/search" className="lt-back">← 返回兰台</Link>
          <div className="lt-state">
            {error?.error.message || "原文加载失败"}
            <button className="retry-inline" onClick={refetch}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  const ch = data;
  const allChecked = bookHighlights.length > 0 && checkedIds.size === bookHighlights.length;

  return (
    <div className="lt-reader">
      <Header />

      {/* 常驻工具条：滚动时始终可达 */}
      <div className="lt-reader-bar">
        {/* 返回来源页：仅从读书笔记/阅读进度页进入时显示，垂直居中与白话/笔记对齐，右边缘对齐目录滚动条 */}
        {fromNotes && (
          <Link to="/library?tab=notes" className="lt-reader-back-fab">
            <span className="lt-return-arrow">↩</span>返回读书笔记
          </Link>
        )}
        {fromProgress && (
          <Link to="/library?tab=progress" className="lt-reader-back-fab">
            <span className="lt-return-arrow">↩</span>返回阅读进度
          </Link>
        )}
        {fromFigure && figureId && (
          <Link to={`/figures/${figureId}`} className="lt-reader-back-fab">
            <span className="lt-return-arrow">↩</span>返回人物生平
          </Link>
        )}
        <div className="lt-reader-bar-left">
          <button
            className="lt-reader-bar-menu"
            onClick={() => setSideOpen((v) => !v)}
            aria-label="目录"
          >
            <span className="lt-menu-ico" aria-hidden="true" />目录
          </button>
          <Link to={`/books/${ch.book_id}`} className="lt-reader-bar-book">
            <span className="lt-back-arrow">&lt;</span>{ch.book_name}
          </Link>
          <span className="lt-reader-bar-sep">·</span>
          <span className="lt-reader-bar-cur">{ch.name}</span>
        </div>
        <div className="lt-reader-bar-right">
          {hasVernacular && (
            <button
              className={`lt-reader-toggle${showVern ? " active" : ""}`}
              onClick={() => setShowVern((v) => !v)}
            >
              白话
            </button>
          )}
          {hasAnnotation && (
            <button
              className={`lt-reader-toggle${showAnnot ? " active" : ""}`}
              onClick={() => setShowAnnot((v) => !v)}
            >
              注释
            </button>
          )}
          {isAuthenticated && (
            <button
              className={`lt-reader-toggle${notesOpen ? " active" : ""}`}
              onClick={toggleNotesPanel}
            >
              笔记{bookHighlights.length > 0 && (
                <span className="lt-notes-badge">{bookHighlights.length}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 浮动划线按钮 */}
      {selectionBox.visible && (
        <button
          className="lt-highlight-btn"
          style={{
            left: `${selectionBox.x}px`,
            top: `${selectionBox.y - 44}px`,
          }}
          onClick={handleConfirmHighlight}
        >
          <span className="lt-highlight-icon" aria-hidden="true" />
          划线
        </button>
      )}

      {/* 划线 toast */}
      {highlightToast && (
        <div className="lt-highlight-toast">{highlightToast}</div>
      )}

      <div className="lt-reader-layout">
        {/* 左栏：全书目录，快速跳篇 */}
        <aside className={`lt-reader-side${sideOpen ? " open" : ""}`}>
          <div className="lt-side-head">
            <Link to={`/books/${ch.book_id}`}>{ch.book_name}</Link>
            <span className="lt-side-head-sub">
              {catalog ? `${catalog.chapters.length} 篇` : ""}
            </span>
          </div>
          <nav className="lt-side-list">
            {catalog?.chapters.map((c) => {
              const active = c.id === ch.id;
              const readable = c.passage_count > 0;
              return (
                <button
                  key={c.id}
                  ref={active ? activeRef : undefined}
                  className={`lt-side-item${active ? " active" : ""}${readable ? "" : " disabled"}`}
                  disabled={!readable}
                  onClick={() => readable && navigate(`/read/${c.id}`)}
                >
                  <span className="lt-side-no">卷{c.volume_no}</span>
                  <span className="lt-side-name">{c.name}</span>
                </button>
              );
            })}
            {!catalog && <div className="lt-side-loading">目录载入中…</div>}
          </nav>
        </aside>
        {sideOpen && (
          <div className="lt-reader-backdrop" onClick={() => setSideOpen(false)} />
        )}

        {/* 右栏：正文 */}
        <main className="lt-reader-main" ref={passagesContainerRef}>
          <motion.article
            key={ch.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            <header className="lt-reader-head">
              {ch.category && <span className="lt-reader-cat">{ch.category}</span>}
              <h1 className="lt-reader-title">{ch.name}</h1>
              {ch.subtitle && <p className="lt-reader-sub">{ch.subtitle}</p>}
            </header>

            {ch.intro && (
              <details className="lt-reader-intro" open>
                <summary className="lt-reader-intro-label">题　解</summary>
                <div className="lt-reader-intro-body">{ch.intro}</div>
              </details>
            )}

            <div className="lt-passages">
              {ch.passages.map((p) => (
                <div
                  className={`lt-para${targetPid === p.id && fromFigure ? " is-target" : ""}`}
                  id={p.id}
                  key={p.id}
                >
                  <p className="lt-para-text">
                    <GlossText content={p.content} glosses={p.glosses} highlights={passageHighlightTexts.get(p.id)} />
                  </p>
                  {showVern && p.vernacular && (
                    <p className="lt-para-vern">{p.vernacular}</p>
                  )}
                  {showAnnot && p.annotation && (
                    <p className="lt-para-annot">{p.annotation}</p>
                  )}
                </div>
              ))}
            </div>

            {/* 本篇词条汇总（默认折叠） */}
            {chapterGlosses.length > 0 && (
              <details className="lt-chapter-glosses">
                <summary className="lt-chapter-glosses-title">
                  本篇词条<span className="lt-chapter-glosses-count">{chapterGlosses.length}</span>
                </summary>
                <dl className="lt-chapter-glosses-list">
                  {chapterGlosses.map((g, i) => {
                    const charPinyins = parseTermPinyin(g.term, g.pinyin);
                    return (
                      <div key={i} className="lt-chapter-gloss-item">
                        <dt className="lt-gloss-term-dt">
                          {charPinyins.map((cp, j) =>
                            cp.isRare && cp.pinyin ? (
                              <ruby key={j} className="lt-gloss-ruby">
                                {cp.char}
                                <rt>{cp.pinyin}</rt>
                              </ruby>
                            ) : (
                              <span key={j}>{cp.char}</span>
                            ),
                          )}
                        </dt>
                        <dd>{g.text}</dd>
                      </div>
                    );
                  })}
                </dl>
              </details>
            )}

            {/* 本篇划线数提示 */}
            {isAuthenticated && chapterHighlightCount > 0 && (
              <div className="lt-chapter-highlights-hint">
                本篇已有 {chapterHighlightCount} 条划线
              </div>
            )}

            <nav className="lt-reader-nav">
              <button
                className="lt-reader-nav-btn prev"
                disabled={!ch.prev}
                onClick={() => ch.prev && navigate(`/read/${ch.prev.id}`)}
              >
                <span className="lt-reader-nav-dir">← 前一篇</span>
                {ch.prev && <span className="lt-reader-nav-name">{ch.prev.name}</span>}
              </button>
              <button
                className="lt-reader-nav-btn next"
                disabled={!ch.next}
                onClick={() => ch.next && navigate(`/read/${ch.next.id}`)}
              >
                <span className="lt-reader-nav-dir">后一篇 →</span>
                {ch.next && <span className="lt-reader-nav-name">{ch.next.name}</span>}
              </button>
            </nav>
          </motion.article>
        </main>

        {/* 右栏：笔记面板 */}
        {isAuthenticated && notesOpen && (
          <>
            <div className="lt-notes-backdrop" onClick={() => setNotesOpen(false)} />
            <aside className="lt-notes-panel">
              <div className="lt-notes-head">
                <div className="lt-notes-head-left">
                  <label className="lt-notes-check-all">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleSelectAll}
                    />
                    <span>全选</span>
                  </label>
                  <span className="lt-notes-count">
                    {bookHighlights.length} 条划线
                  </span>
                </div>
                <div className="lt-notes-head-right">
                  <button
                    className="lt-notes-action"
                    onClick={handleCopyHighlights}
                    disabled={checkedIds.size === 0}
                  >
                    复制
                  </button>
                  <button
                    className="lt-notes-action"
                    onClick={handleExportHighlights}
                    disabled={checkedIds.size === 0}
                  >
                    导出
                  </button>
                  <button
                    className="lt-notes-close"
                    onClick={() => setNotesOpen(false)}
                    aria-label="收起笔记"
                  >
                    》
                  </button>
                </div>
              </div>
              <div className="lt-notes-list">
                {bookHighlights.length === 0 ? (
                  <div className="lt-notes-empty">
                    选中正文中的句子
                    <br />
                    点击"划线"即可添加笔记
                  </div>
                ) : (
                  [...bookHighlights]
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((hl) => (
                      <div key={hl.id} className="lt-notes-item">
                        <label className="lt-notes-item-check">
                          <input
                            type="checkbox"
                            checked={checkedIds.has(hl.id)}
                            onChange={() => toggleCheck(hl.id)}
                          />
                        </label>
                        <div
                          className="lt-notes-item-body"
                          onClick={() => handleNoteJump(hl.chapterId, hl.passageId)}
                          role="button"
                          tabIndex={0}
                        >
                          <p className="lt-notes-item-text">{hl.text}</p>
                          <div className="lt-notes-item-meta">
                            <span>卷{hl.volumeNo} · {hl.chapterName}</span>
                            <button
                              className="lt-notes-item-del"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveHighlight(hl.id);
                              }}
                              title="删除划线"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
