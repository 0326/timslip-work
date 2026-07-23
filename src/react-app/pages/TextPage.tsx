import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getPassage, getChapter } from "../data/api";
import { useApi } from "../hooks/useApi";
import type { Passage } from "../data/types";
import { Header } from "../components/Common/Header";
import { Footer } from "../components/Common/Footer";
import { Loading } from "../components/Common/Loading";
import { PassageView } from "../components/Search/PassageView";
import "../components/Search/search.css";

interface ChapterPassages {
  passages: { id: string; content: string; order_idx: number; version: number }[];
}

export default function TextPage() {
  const params = useParams();
  const navigate = useNavigate();
  const id = params["*"] || "";

  const { data: passage, loading, error, refetch } = useApi<Passage>(
    () => getPassage(id),
    [id],
    `/api/text/${id}`,
  );
  const [siblingIds, setSiblingIds] = useState<{ prev?: string; next?: string }>({});

  useEffect(() => {
    if (!passage) return;
    let cancelled = false;
    getChapter(passage.chapter_id)
      .then((chapter: ChapterPassages) => {
        if (cancelled) return;
        const idx = chapter.passages.findIndex((p) => p.id === passage.id);
        setSiblingIds({
          prev: idx > 0 ? chapter.passages[idx - 1].id : undefined,
          next:
            idx >= 0 && idx < chapter.passages.length - 1
              ? chapter.passages[idx + 1].id
              : undefined,
        });
      })
      .catch(() => {
        // Sibling fetch failure is non-critical
      });
    return () => {
      cancelled = true;
    };
  }, [passage]);

  if (loading) return <Loading />;
  if (error || !passage) {
    return (
      <div className="text-page">
        <Header />
        <div className="text-page-content">
          <Link to="/search" className="text-page-back">← 返回检索</Link>
          <div className="search-results-empty">
            {error?.error.message || "原文加载失败"}
            <button className="retry-inline" onClick={refetch}>重试</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="text-page">
      <Header />
      <div className="text-page-content">
        <Link to="/search" className="text-page-back">← 返回检索</Link>
        <PassageView passage={passage} />
        <div className="text-page-nav">
          <button
            onClick={() => siblingIds.prev && navigate(`/text/${siblingIds.prev}`)}
            disabled={!siblingIds.prev}
          >
            ← 上一段
          </button>
          <button
            onClick={() => siblingIds.next && navigate(`/text/${siblingIds.next}`)}
            disabled={!siblingIds.next}
          >
            下一段 →
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
