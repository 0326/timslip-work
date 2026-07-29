import { useMemo, useRef, useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { getBookCatalog } from "../data/api";
import { getBookIntro } from "../data/bookIntros";
import { useApi } from "../hooks/useApi";
import { useAudio, useBgm } from "../store/audioStore";
import type { BookCatalog, CatalogChapter } from "../data/types";
import { Header } from "../components/Common/Header";
import { Loading } from "../components/Common/Loading";
import "../components/Search/lantai.css";

interface CatGroup {
  category: string;
  key: string;
  chapters: CatalogChapter[];
}

/** 按目录顺序把篇章按 category 归并为连续的类目组（保持 本纪→表→书→世家→列传 的原序） */
function groupByCategory(chapters: CatalogChapter[]): CatGroup[] {
  const groups: CatGroup[] = [];
  for (const ch of chapters) {
    const cat = ch.category || "篇目";
    const last = groups[groups.length - 1];
    if (last && last.category === cat) {
      last.chapters.push(ch);
    } else {
      groups.push({ category: cat, key: `cat-${groups.length}-${cat}`, chapters: [ch] });
    }
  }
  return groups;
}

const HEADER_OFFSET = 76; // 固定头 56 + 呼吸间距

export default function BookPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi<BookCatalog>(
    () => getBookCatalog(id),
    [id],
    `/api/books/${id}/catalog`,
  );

  // 典籍页 hover 提示音（BGM + 静音由全局 AudioProvider 管理）
  const { playHoverBlip } = useAudio();
  useBgm("/assets/audio/classics.mp3", 0.12);

  const groups = useMemo(
    () => (data ? groupByCategory(data.chapters) : []),
    [data],
  );

  const [activeCat, setActiveCat] = useState<string>("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // 滚动时高亮当前类目
  useEffect(() => {
    if (!groups.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.id);
      },
      { rootMargin: `-${HEADER_OFFSET + 8}px 0px -70% 0px`, threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [groups]);

  const jumpTo = (key: string) => {
    const el = sectionRefs.current[key];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <div className="lt-page">
        <Header />
        <div className="lt-page-inner">
          <Link to="/search" className="lt-back">← 返回兰台</Link>
          <div className="lt-state">
            {error?.error.message || "书目加载失败"}
            <button className="retry-inline" onClick={refetch}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  const book = data.book;
  const intro = getBookIntro(book.id);
  const openChapter = (ch: CatalogChapter) => {
    if (ch.passage_count > 0) navigate(`/read/${ch.id}`);
  };

  return (
    <div className="lt-page">
      <Header />
      <div className="lt-book-layout">
        {/* 左栏：书籍信息 + 类目导航（sticky） */}
        <aside className="lt-book-side">
          <Link to="/search" className="lt-back">← 兰台</Link>
          <motion.div
            className="lt-hero-plate"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="lt-hero-plate-title">{book.name}</div>
          </motion.div>
          {intro.tagline && <div className="lt-hero-tagline">{intro.tagline}</div>}
          <div className="lt-hero-meta">
            <span>{book.dynasty}</span>
            <span>{book.author}　撰</span>
            <span>{book.type}</span>
            <span>凡 <b>{book.volume_count}</b> 卷</span>
          </div>
          <nav className="lt-catnav">
            {groups.map((g) => (
              <button
                key={g.key}
                className={`lt-catnav-item${activeCat === g.key ? " active" : ""}`}
                onClick={() => jumpTo(g.key)}
                onMouseEnter={playHoverBlip}
              >
                <span className="lt-catnav-name">{g.category}</span>
                <span className="lt-catnav-count">{g.chapters.length}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* 右栏：题解 + 目录 */}
        <main className="lt-book-main">
          {intro.intro && <p className="lt-hero-intro">{intro.intro}</p>}

          {groups.map((g) => (
            <section
              className="lt-cat-group"
              id={g.key}
              key={g.key}
              ref={(el) => { sectionRefs.current[g.key] = el; }}
            >
              <div className="lt-cat-head">
                <span className="lt-cat-name">{g.category}</span>
                <span className="lt-cat-count">{g.chapters.length} 篇</span>
              </div>
              <div className="lt-chapter-list">
                {g.chapters.map((ch) => {
                  const readable = ch.passage_count > 0;
                  return (
                    <div
                      key={ch.id}
                      className={`lt-chapter${readable ? "" : " lt-chapter--empty"}`}
                      role={readable ? "button" : undefined}
                      tabIndex={readable ? 0 : undefined}
                      onClick={() => openChapter(ch)}
                      onMouseEnter={playHoverBlip}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openChapter(ch);
                      }}
                    >
                      <span className="lt-chapter-no">卷{ch.volume_no}</span>
                      <span className="lt-chapter-body">
                        <span className="lt-chapter-name">{ch.name}</span>
                        {ch.subtitle && (
                          <span className="lt-chapter-sub">{ch.subtitle}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
