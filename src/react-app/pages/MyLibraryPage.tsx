import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../store/authStore";
import { getSave, putSave } from "../services/authClient";
import { getBookIntro } from "../data/bookIntros";
import { getFigures, getBooks } from "../data/api";
import type { Figure, Book } from "../data/types";
import { FigureCard } from "../components/Figure/FigureCard";
import { useFavorites } from "../hooks/useFavorites";
import { Loading } from "../components/Common/Loading";
import { useAudio, useBgm } from "../store/audioStore";
import type { ReadingProgressEntry, WorkSaveData, SaveConflictError } from "../types/auth";
import { useHighlights } from "../hooks/useHighlights";
import "./my-library.css";
import "../components/Figure/figure.css";
import "../components/Figure/figure-game.css";

type TabName = "progress" | "notes" | "favorites";

/** 时间格式化：X 分钟前 / X 小时前 / X 天前 / X 周前 */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hour = 3600 * 1000;
  const day = 24 * hour;
  if (diff < hour) return Math.floor(diff / 60000) + " 分钟前";
  if (diff < day) return Math.floor(diff / hour) + " 小时前";
  if (diff < 7 * day) return Math.floor(diff / day) + " 天前";
  return Math.floor(diff / (7 * day)) + " 周前";
}

export default function MyLibraryPage() {
  const { playHoverBlip } = useAudio();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { favorites } = useFavorites();

  // 当前标签以 URL 为唯一数据源，保证页面内标签与头像下拉菜单切换一致
  const activeTab: TabName =
    searchParams.get("tab") === "favorites" ? "favorites"
      : searchParams.get("tab") === "notes" ? "notes"
      : "progress";

  // 阅读进度/笔记标签 → 兰台 BGM；我的收藏标签 → 人物 BGM
  const bgmUrl = activeTab === "favorites"
    ? "/assets/audio/characters.mp3"
    : "/assets/audio/classics.mp3";
  useBgm(bgmUrl, 0.3);
  const [entries, setEntries] = useState<ReadingProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 存档元信息（版本号 + clientUpdatedAt），用于乐观更新写回
  const saveMetaRef = useRef<{ version?: number; clientUpdatedAt?: number }>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── 阅读笔记：划线数据 ──
  const {
    highlights: allHighlights,
    loading: notesLoading,
    removeHighlight,
    totalCount: highlightTotal,
  } = useHighlights(isAuthenticated);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  // ── 书籍元数据（朝代/作者）查找表 ──
  const [bookMeta, setBookMeta] = useState<Record<string, Book>>({});
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getBooks().then((res) => {
      if (cancelled) return;
      const map: Record<string, Book> = {};
      for (const b of res.books) map[b.id] = b;
      setBookMeta(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ── 我的收藏：人物列表 ──
  const [favSortMode, setFavSortMode] = useState<"era" | "star">("era");
  const [favItems, setFavItems] = useState<Figure[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const favIdList = useMemo(() => [...favorites], [favorites]);

  useEffect(() => {
    if (favIdList.length === 0) { setFavItems([]); return; }
    let cancelled = false;
    setFavLoading(true);
    // 按实际收藏 ID 精确查询，避免拉取全量人物再客户端过滤
    getFigures({ ids: favIdList })
      .then((res) => {
        if (cancelled) return;
        setFavItems(res.items);
      })
      .catch(() => { if (!cancelled) setFavItems([]); })
      .finally(() => { if (!cancelled) setFavLoading(false); });
    return () => { cancelled = true; };
  }, [favIdList]);

  /** 从存档读取阅读进度列表 */
  const loadProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSave();
      if (res.exists && res.save?.readingProgress) {
        const list = Object.values(res.save.readingProgress).sort(
          (a, b) => b.lastReadAt - a.lastReadAt,
        );
        setEntries(list);
      } else {
        setEntries([]);
      }
      saveMetaRef.current = {
        version: res.version,
        clientUpdatedAt: res.clientUpdatedAt,
      };
    } catch {
      setError("读取阅读记录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) loadProgress();
    if (!authLoading && !isAuthenticated) {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, loadProgress]);

  /** 写回存档（带冲突重试） */
  const writeSave = useCallback(
    async (newEntries: ReadingProgressEntry[]) => {
      const readingProgress: Record<string, ReadingProgressEntry> = {};
      for (const e of newEntries) readingProgress[e.bookId] = e;

      const save: WorkSaveData = {
        readingProgress,
        lastVisited: "/library",
      };

      try {
        await putSave(
          save,
          Date.now(),
          "default",
          saveMetaRef.current.version,
        );
        // 写回成功后刷新元信息
        const res = await getSave();
        saveMetaRef.current = {
          version: res.version,
          clientUpdatedAt: res.clientUpdatedAt,
        };
      } catch (err) {
        const conflict = err as SaveConflictError;
        if (conflict.error === "conflict") {
          // 冲突：以服务端为准，重新加载
          await loadProgress();
          showToast("数据已同步，请重试");
          return;
        }
        showToast("保存失败，请稍后重试");
      }
    },
    [loadProgress],
  );

  /** 删除阅读记录 */
  const handleRemove = useCallback(
    (bookId: string) => {
      const entry = entries.find((e) => e.bookId === bookId);
      if (!entry) return;
      setRemovingId(bookId);
      setTimeout(async () => {
        const newEntries = entries.filter((e) => e.bookId !== bookId);
        setEntries(newEntries);
        setRemovingId(null);
        showToast(`已移除《${entry.bookName}》阅读记录`);
        await writeSave(newEntries);
      }, 380);
    },
    [entries, writeSave],
  );

  /** 点击书封跳转阅读 */
  const handleOpenBook = useCallback(
    (entry: ReadingProgressEntry) => {
      navigate(`/read/${entry.chapterId}?from=progress`);
    },
    [navigate],
  );

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  // ── 标签指示器 ──
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const update = () => {
      const active = tabsRef.current?.querySelector<HTMLButtonElement>(
        `.ml-tab[data-tab="${activeTab}"]`,
      );
      if (active) {
        const parentRect = tabsRef.current!.getBoundingClientRect();
        const rect = active.getBoundingClientRect();
        setIndicator({
          left: rect.left - parentRect.left,
          width: rect.width,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeTab]);

  // ── 统计 ──
  const stats = {
    books: entries.length,
    chapters: entries.reduce((s, e) => s + e.chaptersRead, 0),
    avg:
      entries.length > 0
        ? Math.round(entries.reduce((s, e) => s + e.progress, 0) / entries.length)
        : 0,
  };

  if (authLoading) return <Loading />;

  const notAuthed = !isAuthenticated;

  return (
    <div className="ml-page">
      <div className="ml-inner">
        {/* 标签切换 */}
        <div className="ml-tabs" ref={tabsRef}>
          <button
            className={`ml-tab${activeTab === "progress" ? " active" : ""}`}
            data-tab="progress"
            onClick={() => navigate("/library")}
            onMouseEnter={playHoverBlip}
          >
            阅读进度
            <span className="ml-tab-count">{stats.books}</span>
          </button>
          <button
            className={`ml-tab${activeTab === "notes" ? " active" : ""}`}
            data-tab="notes"
            onClick={() => navigate("/library?tab=notes")}
            onMouseEnter={playHoverBlip}
          >
            读书笔记
            <span className="ml-tab-count">{highlightTotal}</span>
          </button>
          <button
            className={`ml-tab${activeTab === "favorites" ? " active" : ""}`}
            data-tab="favorites"
            onClick={() => navigate("/library?tab=favorites")}
            onMouseEnter={playHoverBlip}
          >
            我的收藏
            <span className="ml-tab-count">{favIdList.length}</span>
          </button>
          <div
            className="ml-tab-indicator"
            style={{ left: indicator.left, width: indicator.width }}
          />
        </div>

        {/* ── 阅读进度面板 ── */}
        {activeTab === "progress" && (
          <>
            {notAuthed ? (
              <div className="ml-empty">
                <div className="ml-empty-icon">登</div>
                <div className="ml-empty-title">请先登录后查看</div>
                <div className="ml-empty-desc">
                  登录后可跨设备同步阅读进度
                  <br />
                  所读篇章将自动记录于此
                </div>
              </div>
            ) : error ? (
              <div className="ml-empty">
                <div className="ml-empty-icon">誤</div>
                <div className="ml-empty-title">{error}</div>
                <button className="ml-empty-btn" onClick={loadProgress}>
                  重新加载
                </button>
              </div>
            ) : (
              <>
                {loading ? (
                  <Loading />
                ) : (
                  <>
                    {entries.length > 0 && (
                      <div className="ml-stats">
                        <div className="ml-stat-item">
                          <span className="ml-stat-num">{stats.books}</span>
                          <span className="ml-stat-label">部在读</span>
                        </div>
                        <div className="ml-stat-sep" />
                        <div className="ml-stat-item">
                          <span className="ml-stat-num">{stats.chapters}</span>
                          <span className="ml-stat-label">篇累计</span>
                        </div>
                        <div className="ml-stat-sep" />
                        <div className="ml-stat-item">
                          <span className="ml-stat-num">{stats.avg}</span>
                          <span className="ml-stat-label">% 均进度</span>
                        </div>
                        <span className="ml-stat-hint">
                          点击书封继续阅读 · 悬停显示删除
                        </span>
                      </div>
                    )}

                    {entries.length === 0 ? (
              <div className="ml-empty">
                <div className="ml-empty-icon">書</div>
                <div className="ml-empty-title">尚无阅读记录</div>
                <div className="ml-empty-desc">
                  前往兰台，开启你的读史之旅
                  <br />
                  所读篇章将自动记录于此
                </div>
                <Link to="/search" className="ml-empty-btn">
                  前往兰台
                </Link>
              </div>
            ) : (
              <div className="ml-shelf">
                {entries.map((entry) => {
                  const intro = getBookIntro(entry.bookId);
                  return (
                    <div
                      key={entry.bookId}
                      className={`ml-book-card${removingId === entry.bookId ? " removing" : ""}`}
                    >
                      <button
                        className="ml-book-delete"
                        title="移除阅读记录"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(entry.bookId);
                        }}
                      >
                        ✕
                      </button>
                      <button
                        className="ml-book-cover"
                        onClick={() => handleOpenBook(entry)}
                        onMouseEnter={playHoverBlip}
                      >
                        <div className="ml-book-seal">
                          <span className="ml-book-seal-num">
                            {entry.progress}
                          </span>
                          <span className="ml-book-seal-pct">%</span>
                        </div>
                        <div className="ml-book-label">
                          <span className="ml-book-title">
                            {entry.bookName}
                          </span>
                        </div>
                        <div className="ml-book-foot">
                          <span className="ml-book-dynasty">
                            {entry.dynasty}
                          </span>
                          <span className="ml-book-author">
                            {entry.author} 撰
                          </span>
                        </div>
                        <div className="ml-book-progress-bar">
                          <div
                            className="ml-book-progress-fill"
                            style={{ width: `${entry.progress}%` }}
                          />
                        </div>
                        {intro.tagline && (
                          <div className="ml-book-tagline">
                            {intro.tagline}
                          </div>
                        )}
                      </button>
                      <div className="ml-book-info">
                        <div className="ml-book-info-chapter">
                          卷{entry.volumeNo} · {entry.chapterName}
                        </div>
                        <div className="ml-book-info-meta">
                          <span>{timeAgo(entry.lastReadAt)}</span>
                          <span className="dot">·</span>
                          <span>
                            已读 {entry.chaptersRead}/{entry.volumeCount} 篇
                          </span>
                        </div>
                        <div className="ml-book-info-pct">
                          <div className="ml-book-info-track">
                            <div
                              className="ml-book-info-track-fill"
                              style={{ width: `${entry.progress}%` }}
                            />
                          </div>
                          <span className="ml-book-info-pct-text">
                            {entry.progress}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
                    </>
                  )}
                </>
              )}
          </>
        )}

        {/* ── 读书笔记面板 ── */}
        {activeTab === "notes" && (
          <>
            {notAuthed ? (
              <div className="ml-empty">
                <div className="ml-empty-icon">登</div>
                <div className="ml-empty-title">请先登录后查看</div>
                <div className="ml-empty-desc">
                  登录后可跨设备同步划线笔记
                  <br />
                  在阅读时选中句子即可划线
                </div>
              </div>
            ) : notesLoading ? (
              <Loading />
            ) : Object.keys(allHighlights).length === 0 ? (
              <div className="ml-empty">
                <div className="ml-empty-icon">筆</div>
                <div className="ml-empty-title">尚无划线笔记</div>
                <div className="ml-empty-desc">
                  阅读典籍时，选中感兴趣的句子
                  <br />
                  点击"划线"即可保存笔记
                </div>
                <Link to="/search" className="ml-empty-btn">
                  前往兰台
                </Link>
              </div>
            ) : (
              <div className="ml-notes-section">
                <div className="ml-notes-stats">
                  <span>{Object.keys(allHighlights).length} 部典籍</span>
                  <span className="dot">·</span>
                  <span>{highlightTotal} 条划线</span>
                  <button
                    className="ml-notes-export-all"
                    onClick={() => {
                      const allHls = Object.values(allHighlights).flat().sort((a, b) => b.createdAt - a.createdAt);
                      if (allHls.length === 0) return;
                      const lines = allHls.map((h, i) =>
                        `${i + 1}. 《${h.bookName}》卷${h.volumeNo} · ${h.chapterName}\n   ${h.text}`,
                      );
                      const content = `穿越·兰台 读书笔记\n共 ${allHls.length} 条划线\n\n${lines.join("\n\n")}`;
                      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "读书笔记_全部.txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    导出全部
                  </button>
                </div>
                <div className="ml-notes-list">
                  {Object.entries(allHighlights)
                    .sort(([, a], [, b]) => {
                      const aLast = Math.max(...a.map((h) => h.createdAt));
                      const bLast = Math.max(...b.map((h) => h.createdAt));
                      return bLast - aLast;
                    })
                    .map(([bookId, hls]) => {
                      const first = hls[0];
                      const intro = getBookIntro(bookId);
                      const isExpanded = expandedBook === bookId;
                      return (
                        <div key={bookId} className="ml-notes-book">
                          <div className="ml-notes-book-head">
                            <button
                              className="ml-notes-book-cover lt-book"
                              onClick={() => setExpandedBook(isExpanded ? null : bookId)}
                              onMouseEnter={playHoverBlip}
                            >
                              <span className="lt-book-spine" />
                              <span className="lt-book-label">
                                <span className="lt-book-title">{first.bookName}</span>
                              </span>
                              <span className="lt-book-foot">
                                <span className="lt-book-dynasty">{bookMeta[bookId]?.dynasty}</span>
                                <span className="lt-book-author">{bookMeta[bookId]?.author}</span>
                              </span>
                            </button>
                            <button
                              className="ml-notes-book-info"
                              onClick={() => setExpandedBook(isExpanded ? null : bookId)}
                              onMouseEnter={playHoverBlip}
                            >
                              <span className="ml-notes-book-name">{first.bookName}</span>
                              <span className="ml-notes-book-meta">
                                {hls.length} 条划线 · 最近 {timeAgo(Math.max(...hls.map((h) => h.createdAt)))}
                              </span>
                              {intro.tagline && (
                                <span className="ml-notes-book-tagline">{intro.tagline}</span>
                              )}
                            </button>
                            <span className={`ml-notes-chevron${isExpanded ? " open" : ""}`}>›</span>
                          </div>
                          {isExpanded && (
                            <div className="ml-notes-book-items">
                              {[...hls]
                                .sort((a, b) => b.createdAt - a.createdAt)
                                .map((hl) => (
                                  <Link
                                    key={hl.id}
                                    to={`/read/${hl.chapterId}?p=${hl.passageId}&from=notes`}
                                    className="ml-notes-item"
                                  >
                                    <p className="ml-notes-item-text">{hl.text}</p>
                                    <div className="ml-notes-item-foot">
                                      <span>卷{hl.volumeNo} · {hl.chapterName}</span>
                                      <div className="ml-notes-item-actions">
                                        <span className="ml-notes-item-time">{timeAgo(hl.createdAt)}</span>
                                        <button
                                          className="ml-notes-item-del"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            removeHighlight(hl.id, bookId);
                                          }}
                                          title="删除划线"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  </Link>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 我的收藏面板 ── */}
        {activeTab === "favorites" && (
          favIdList.length === 0 ? (
            <div className="ml-empty">
              <div className="ml-empty-icon">藏</div>
              <div className="ml-empty-title">尚未收藏任何人物</div>
              <div className="ml-empty-desc">
                前往群英谱，收藏你感兴趣的历史人物
                <br />
                收藏后可在此快速查看
              </div>
              <Link to="/figures" className="ml-empty-btn">
                前往群英谱
              </Link>
            </div>
          ) : (
            <div className="ml-fav-section">
              <div className="ml-fav-toolbar">
                <span className="ml-fav-count">共 {favItems.length} 人</span>
                <div className="ml-fav-seg" role="group" aria-label="排序方式">
                  <button
                    type="button"
                    className={`ml-fav-seg-btn${favSortMode === "era" ? " active" : ""}`}
                    onClick={() => setFavSortMode("era")}
                    onMouseEnter={playHoverBlip}
                  >
                    时序
                  </button>
                  <button
                    type="button"
                    className={`ml-fav-seg-btn${favSortMode === "star" ? " active" : ""}`}
                    onClick={() => setFavSortMode("star")}
                    onMouseEnter={playHoverBlip}
                  >
                    星级
                  </button>
                </div>
              </div>
              {favLoading ? (
                <Loading />
              ) : (
                <motion.div
                  className="figure-list-grid"
                  key={favSortMode}
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
                  initial="hidden"
                  animate="show"
                >
                  {favItems.map((figure) => (
                    <FigureCard key={figure.id} figure={figure} navQuery={`from=favorites&sort=${favSortMode}`} />
                  ))}
                </motion.div>
              )}
            </div>
          )
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            padding: "0.7rem 1.5rem",
            background: "rgba(26,26,26,0.92)",
            color: "var(--bg)",
            fontSize: "0.84rem",
            letterSpacing: "0.06em",
            borderRadius: "2px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.24)",
            whiteSpace: "pre-line",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
