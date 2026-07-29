import { useSearchParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { useSearch } from "../hooks/useSearch";
import { useApi } from "../hooks/useApi";
import { getBooks } from "../data/api";
import { getBookIntro } from "../data/bookIntros";
import { useAudio, useBgm } from "../store/audioStore";
import type { Book } from "../data/types";
import { Header } from "../components/Common/Header";
import { Footer } from "../components/Common/Footer";
import { SearchBar } from "../components/Search/SearchBar";
import { ResultList } from "../components/Search/ResultList";
import "../components/Search/search.css";
import "../components/Search/lantai.css";

const LIMIT = 20;

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";
  const book = searchParams.get("book") || "";
  const page = parseInt(searchParams.get("page") || "1");

  // 书架 hover 提示音
  const { playHoverBlip } = useAudio();
  useBgm("/assets/audio/classics.mp3", 0.12);

  // 获取所有史书列表
  const { data: booksData } = useApi(getBooks, [], "/api/books");
  const books = booksData?.books || [];

  // 构建下拉选项：全部史书 + 二十四史
  const bookOptions = useMemo(() => {
    const opts = [{ value: "", label: "全部史书" }];
    books.forEach((b: Book) => {
      opts.push({ value: b.id, label: b.name });
    });
    return opts;
  }, [books]);

  // 仅在有 query 时触发搜索
  const { data, loading, error } = useSearch(query, { book, page, limit: LIMIT });

  const handleSearch = (q: string, b: string) => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (b) params.book = b;
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (book) params.book = book;
    params.page = String(newPage);
    setSearchParams(params);
  };

  const handleBookClick = (bookId: string) => {
    // 点击史书进入书籍介绍 + 目录页
    navigate(`/books/${bookId}`);
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const hasQuery = query.length > 0;

  return (
    <div className="search-page">
      <Header />
      <div className={`search-page-content${!hasQuery ? " wide" : ""}`}>
        {/* <h1 className="search-page-title">兰台</h1> */}
        {!hasQuery && (
          <p className="lt-shelf-subtitle">廿四史 · 三千年信史，一架青编</p>
        )}
        <SearchBar
          initialQuery={query}
          initialBook={book}
          books={bookOptions}
          onSearch={handleSearch}
        />

        {/* 无搜索词时：默认展示二十四史书架 */}
        {!hasQuery && (
          <motion.div
            className="lt-shelf"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
            initial="hidden"
            animate="show"
          >
            {books.map((b: Book, i: number) => {
              // 已收录原文（导入了卷）即可翻阅
              const hasText = (b.imported_volumes ?? 0) > 0;
              const intro = getBookIntro(b.id);
              return (
                <motion.button
                  key={b.id}
                  type="button"
                  className={`lt-book${hasText ? "" : " lt-book--empty"}`}
                  onClick={() => hasText && handleBookClick(b.id)}
                  disabled={!hasText}
                  onMouseEnter={playHoverBlip}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    show: { opacity: 1, y: 0 },
                  }}
                  whileHover={hasText ? { y: -6 } : undefined}
                  transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                >
                  <span className="lt-book-spine" aria-hidden="true" />
                  <span className="lt-book-no">{i + 1}</span>
                  <span className="lt-book-label">
                    <span className="lt-book-title">{b.name}</span>
                  </span>
                  <span className="lt-book-foot">
                    <span className="lt-book-dynasty">{b.dynasty}</span>
                    <span className="lt-book-author">{b.author}撰</span>
                  </span>
                  {intro.tagline && (
                    <span className="lt-book-tagline">{intro.tagline}</span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* 有搜索词时：展示搜索结果 */}
        {hasQuery && (
          <>
            {error && (
              <div className="search-results-empty">
                检索出错：{error.error.message}
              </div>
            )}
            {data && (
              <>
                <ResultList results={data.results} loading={loading} />
                {totalPages > 1 && (
                  <div className="search-pagination">
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page <= 1}
                    >
                      上一页
                    </button>
                    <span className="search-pagination-info">
                      {page} / {totalPages} 页 · 共 {data.total} 条
                    </span>
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page >= totalPages}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
