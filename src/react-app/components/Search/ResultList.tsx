import { useNavigate } from "react-router-dom";
import type { SearchResult } from "../../data/types";

interface ResultListProps {
  results: SearchResult[];
  loading: boolean;
}

export function ResultList({ results, loading }: ResultListProps) {
  const navigate = useNavigate();

  if (loading) {
    return <div className="search-results-loading">检索中…</div>;
  }

  if (results.length === 0) {
    return <div className="search-results-empty">无匹配结果</div>;
  }

  return (
    <ul className="search-results" role="list">
      {results.map((result) => (
        <li
          key={result.passage_id}
          className="search-result-item"
          onClick={() => navigate(`/text/${result.passage_id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(`/text/${result.passage_id}`);
          }}
        >
          <div className="search-result-meta">
            <span className="search-result-book">{result.book_name || result.book_id}</span>
            {result.chapter_name && (
              <span className="search-result-chapter">· {result.chapter_name}</span>
            )}
          </div>
          <p
            className="search-result-snippet"
            dangerouslySetInnerHTML={{ __html: result.highlight || result.snippet }}
          />
          <span className="search-result-id">{result.passage_id}</span>
        </li>
      ))}
    </ul>
  );
}
