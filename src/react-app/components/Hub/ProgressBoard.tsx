import { useNavigate } from "react-router-dom";
import type { Book } from "../../data/types";

interface ProgressBoardProps {
  books: Book[];
}

// 已开启穿越（有游戏子站）的史书及其子站域名
const TIMESLIP_SITES: Record<string, string> = {
  shiji: "https://shiji.timeslip.work",
};

export function ProgressBoard({ books }: ProgressBoardProps) {
  const navigate = useNavigate();

  const handleBookClick = (book: Book, isGame: boolean, hasText: boolean) => {
    if (isGame) {
      window.location.href = TIMESLIP_SITES[book.id];
    } else if (hasText) {
      // 已收录但无游戏 → 进兰台检索该书
      navigate(`/search?book=${book.id}`);
    }
  };

  return (
    <section className="hub-section">
      <h2 className="hub-section-title">二十四史</h2>
      <div className="hub-books-grid">
        {books.map((book) => {
          const isGame = !!TIMESLIP_SITES[book.id];
          const hasText = (book.imported_volumes ?? 0) > 0; // 已导入原文 → 可检索
          const clickable = isGame || hasText;
          const status = isGame ? "可穿越" : hasText ? "可检索" : "尚未开启";
          return (
            <div
              key={book.id}
              className={`hub-book-card${clickable ? " active" : " planned"}`}
              onClick={() => handleBookClick(book, isGame, hasText)}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleBookClick(book, isGame, hasText);
                }
              }}
            >
              <div className="hub-book-name">{book.name}</div>
              <div className="hub-book-meta">
                <span className="hub-book-dynasty">{book.dynasty}</span>
                <span className="hub-book-author">{book.author}</span>
              </div>
              <div className="hub-book-status">{status}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
