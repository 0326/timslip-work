import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { getFigures } from "../data/api";
import type { FigureListResponse } from "../data/types";
import { FigureCard } from "../components/Figure/FigureCard";
import { Loading } from "../components/Common/Loading";
import "../components/Figure/figure.css";

const PAGE_SIZE = 24;

export default function FigureListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<FigureListResponse["items"]>([]);
  const [meta, setMeta] = useState<{ total: number; filters: FigureListResponse["filters"] } | null>(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"era" | "star">("era");
  const [minStar, setMinStar] = useState<number>(0);

  const dynasty = searchParams.get("dynasty") || "";
  const identity = searchParams.get("identity") || "";

  const fetchParams = () => ({
    dynasty: dynasty || undefined,
    identity: identity || undefined,
    sort: sortMode,
    minStar: minStar || undefined,
    q: query || undefined,
  });

  // 筛选/排序/搜索条件变化：重置到第1页
  useEffect(() => {
    setLoading(true);
    setError(null);
    setItems([]);
    setPage(1);
    // 有搜索词时拉较大 limit（一次拿全），否则按分页
    const limit = query ? 200 : PAGE_SIZE;
    getFigures({ page: 1, limit, ...fetchParams() })
      .then((res) => { setItems(res.items); setMeta({ total: res.total, filters: res.filters }); })
      .catch((err) => setError(err?.error?.message || "加载失败"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynasty, identity, sortMode, minStar, query]);

  const loadMore = () => {
    if (loadingMore || query) return; // 搜索模式不分页
    const nextPage = page + 1;
    setLoadingMore(true);
    getFigures({ page: nextPage, limit: PAGE_SIZE, ...fetchParams() })
      .then((res) => { setItems((prev) => [...prev, ...res.items]); setPage(nextPage); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const commitSearch = () => {
    setQuery(queryDraft.trim());
  };

  const setFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  if (loading) return <Loading />;
  if (error) return <div className="figure-list"><div style={{ padding: "var(--space-xl)", margin: "0 auto" }}>{error}</div></div>;
  if (!meta) return null;

  const hasMore = !query && items.length < meta.total;

  return (
    <div className="figure-list">
      <aside className="figure-list-sidebar">
        <div className="figure-list-filter-group">
          <h3>朝代</h3>
          <div className="figure-list-tag-group">
            <span
              className={`figure-list-tag${!dynasty ? " active" : ""}`}
              onClick={() => setFilter("dynasty", "")}
            >
              全部
            </span>
            {meta.filters.dynasties.map((d) => (
              <span
                key={d.value}
                className={`figure-list-tag${dynasty === d.value ? " active" : ""}`}
                onClick={() => setFilter("dynasty", d.value)}
              >
                {d.value} · {d.count}
              </span>
            ))}
          </div>
        </div>
        <div className="figure-list-filter-group">
          <h3>身份</h3>
          <div className="figure-list-tag-group">
            <span
              className={`figure-list-tag${!identity ? " active" : ""}`}
              onClick={() => setFilter("identity", "")}
            >
              全部
            </span>
            {meta.filters.identities.map((i) => (
              <span
                key={i.value}
                className={`figure-list-tag${identity === i.value ? " active" : ""}`}
                onClick={() => setFilter("identity", i.value)}
              >
                {i.value} · {i.count}
              </span>
            ))}
          </div>
        </div>
      </aside>
      <main className="figure-list-main">
        <div className="figure-list-header">
          <h1 className="figure-list-title">青史人物</h1>
          <div className="figure-list-actions">
            <Link to="/figures?view=graph" className="figure-list-graphbtn">
              <i className="ti ti-affiliate" aria-hidden="true" /> 关系星图
            </Link>
            <span className="figure-list-count">{query ? `${items.length} / ${meta.total}` : `共 ${meta.total}`} 人</span>
          </div>
        </div>
        <div className="figure-list-toolbar">
          <div className="figure-search-combo">
            <span className="figure-search-icon"><i className="ti ti-search" aria-hidden="true" /></span>
            <input
              className="figure-search-input"
              type="search"
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitSearch(); }}
              placeholder="搜索人名 / 字号 / 别称…"
              aria-label="搜索人物"
            />
            <div className="figure-filter-dropdowns">
              <div className="figure-filter-btn">
                <select
                  className="figure-filter-trigger"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as "era" | "star")}
                  aria-label="排序方式"
                >
                  <option value="era">时序</option>
                  <option value="star">星级</option>
                </select>
              </div>
              <div className="figure-filter-btn">
                <select
                  className="figure-filter-trigger"
                  value={minStar}
                  onChange={(e) => setMinStar(Number(e.target.value))}
                  aria-label="最低星级"
                >
                  <option value={0}>全部星级</option>
                  <option value={5}>5★</option>
                  <option value={4}>4★+</option>
                  <option value={3}>3★+</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              className="figure-search-btn"
              onClick={commitSearch}
              aria-label="搜索"
            >
              搜索
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="figure-empty">{query ? `没有匹配「${query}」的人物` : "暂无人物"}</div>
        ) : (
          <motion.div
            className="figure-list-grid"
            key={`${dynasty}|${identity}|${sortMode}|${minStar}|${query}`}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
            initial="hidden"
            animate="show"
          >
            {items.map((figure) => (
              <FigureCard key={figure.id} figure={figure} />
            ))}
          </motion.div>
        )}
        {hasMore && (
          <div style={{ textAlign: "center", padding: "var(--space-xl) 0" }}>
            <button
              className="figure-list-tag"
              style={{ fontSize: "0.9rem", padding: "0.5em 1.5em", cursor: "pointer" }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "加载中…" : `加载更多（已显示 ${items.length} / ${meta.total}）`}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
