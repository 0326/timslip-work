import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { getChapter, getBookCatalog } from "../data/api";
import { useApi } from "../hooks/useApi";
import type { ChapterDetail, BookCatalog } from "../data/types";
import { Header } from "../components/Common/Header";
import { Loading } from "../components/Common/Loading";
import "../components/Search/lantai.css";

export default function ReaderPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = params["*"] || "";
  const targetPid = searchParams.get("p");

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

  const hasVernacular = useMemo(
    () => !!data?.passages.some((p) => p.vernacular),
    [data],
  );
  const hasAnnotation = useMemo(
    () => !!data?.passages.some((p) => p.annotation),
    [data],
  );

  const [showVern, setShowVern] = useState(false);
  const [showAnnot, setShowAnnot] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);

  // 切换篇章后关闭抽屉；无锚点段落时回到页首
  useEffect(() => {
    if (!targetPid) window.scrollTo({ top: 0 });
    setSideOpen(false);
  }, [id, targetPid]);

  // 从人物事迹跳转而来：定位到对应段落并短暂高亮
  useEffect(() => {
    if (!data || !targetPid) return;
    const t = setTimeout(() => {
      const el = document.getElementById(targetPid);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setPulseId(targetPid);
    }, 80);
    const clear = setTimeout(() => setPulseId(null), 2800);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [data, targetPid]);

  // 侧栏内把当前篇滚入视野
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [catalog, id]);

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

  return (
    <div className="lt-reader">
      <Header />

      {/* 常驻工具条：滚动时始终可达 */}
      <div className="lt-reader-bar">
        <div className="lt-reader-bar-left">
          <button
            className="lt-reader-bar-menu"
            onClick={() => setSideOpen((v) => !v)}
            aria-label="目录"
          >
            <span className="lt-menu-ico" aria-hidden="true" />目录
          </button>
          <Link to={`/books/${ch.book_id}`} className="lt-reader-bar-book">
            {ch.book_name}
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
        </div>
      </div>

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
        <main className="lt-reader-main">
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
                  className={`lt-para${pulseId === p.id ? " pulse" : ""}`}
                  id={p.id}
                  key={p.id}
                >
                  <p className="lt-para-text">{p.content}</p>
                  {showVern && p.vernacular && (
                    <p className="lt-para-vern">{p.vernacular}</p>
                  )}
                  {showAnnot && p.annotation && (
                    <p className="lt-para-annot">{p.annotation}</p>
                  )}
                </div>
              ))}
            </div>

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
      </div>
    </div>
  );
}
