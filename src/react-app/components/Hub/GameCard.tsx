import { useNavigate } from "react-router-dom";

interface GameCardProps {
  title: string;
  description: string;
  available: boolean;
  bookId?: string;
}

export function GameCard({ title, description, available, bookId }: GameCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className={`hub-game-card${available ? " available" : " locked"}`}
      onClick={() => available && bookId && navigate(`/search?book=${bookId}`)}
      role={available ? "button" : undefined}
      tabIndex={available ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" && available && bookId) {
          navigate(`/search?book=${bookId}`);
        }
      }}
    >
      <div className="hub-game-card-title">{title}</div>
      <p className="hub-game-card-desc">{description}</p>
      <div className="hub-game-card-cta">
        {available ? "进入 →" : "敬请期待"}
      </div>
    </div>
  );
}
