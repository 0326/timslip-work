import { useApi } from "../hooks/useApi";
import { getBooks } from "../data/api";
import { Header } from "../components/Common/Header";
import { Footer } from "../components/Common/Footer";
import { Loading } from "../components/Common/Loading";
import { ProgressBoard } from "../components/Hub/ProgressBoard";
import "../components/Hub/hub.css";

export default function HubPage() {
  const { data, loading, error, refetch } = useApi(getBooks, [], "/api/books");

  if (loading) return <Loading />;

  const books = data?.books || [];

  return (
    <div className="hub-page">
      <Header />
      <div className="hub-page-content">
        <h1 className="hub-page-title">穿越</h1>
        {error && (
          <div className="search-results-empty">
            数据加载失败：{error.error.message}
            <button className="retry-inline" onClick={refetch}>重试</button>
          </div>
        )}
        <ProgressBoard books={books} />
      </div>
      <Footer />
    </div>
  );
}
