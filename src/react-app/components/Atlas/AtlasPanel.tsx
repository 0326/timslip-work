import { Link } from "react-router-dom";
import type { AtlasFrame, AtlasPeriodFigure, RegimeProps } from "./types";
import { BOOK_TITLES, KIND_LABEL, formatYear } from "./types";

interface AtlasPanelProps {
  frame: AtlasFrame;
  selected: RegimeProps | null;
  periodFigures: AtlasPeriodFigure[];
  onClose: () => void;
  onPickFigure: (id: string) => void;
}

function BookChips({ books }: { books: string[] }) {
  return (
    <div className="atlas-panel-books">
      {books.map((id) => (
        <Link key={id} to={`/books/${id}`} className="atlas-book-chip">
          《{BOOK_TITLES[id] ?? id}》
        </Link>
      ))}
    </div>
  );
}

function lifespan(f: AtlasPeriodFigure): string {
  const b = f.birthYear;
  const d = f.deathYear;
  const fmt = (y: number) => (y < 0 ? `前${-y}` : `${y}`);
  if (b != null && d != null) return `${fmt(b)}—${fmt(d)}`;
  if (d != null) return `？—${fmt(d)}`;
  if (b != null) return `${fmt(b)}—？`;
  return "";
}

/** 同期史册人物：由 /api/atlas 按断面年窗口自动检出，点击跳人物页 */
function PeriodFigures({
  figures,
  onPick,
}: {
  figures: AtlasPeriodFigure[];
  onPick: (id: string) => void;
}) {
  if (!figures.length) return null;
  return (
    <div className="atlas-period">
      <p className="atlas-panel-caption">同期史册人物</p>
      <ul className="atlas-period-list">
        {figures.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => onPick(f.id)}>
              <span className="atlas-period-name">{f.name}</span>
              {f.identity && <span className="atlas-period-tag">{f.identity}</span>}
              <span className="atlas-period-years">{lifespan(f)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 左上信息卡：默认展示当前断面（含同期人物），点击政权后展示政权详情 */
export function AtlasPanel({
  frame,
  selected,
  periodFigures,
  onClose,
  onPickFigure,
}: AtlasPanelProps) {
  if (selected) {
    return (
      <aside className="atlas-panel" aria-live="polite">
        <button type="button" className="atlas-panel-close" onClick={onClose} aria-label="返回断面信息">
          ×
        </button>
        <div className="atlas-panel-title">
          <i className="atlas-panel-swatch" style={{ background: selected.color }} />
          <h2>{selected.regime}</h2>
          <span className="atlas-panel-kind">{KIND_LABEL[selected.kind]}</span>
        </div>
        <p className="atlas-panel-sub">
          {frame.yearLabel} · {formatYear(frame.year)}
        </p>
        {selected.note && <p className="atlas-panel-note">{selected.note}</p>}
        <p className="atlas-panel-caption">载其事者</p>
        <BookChips books={frame.books} />
      </aside>
    );
  }
  return (
    <aside className="atlas-panel" aria-live="polite">
      <div className="atlas-panel-title">
        <h2>{frame.label}</h2>
        <span className="atlas-panel-kind">{frame.yearLabel}</span>
      </div>
      <p className="atlas-panel-sub">{formatYear(frame.year)}</p>
      <p className="atlas-panel-blurb">{frame.blurb}</p>
      <BookChips books={frame.books} />
      <PeriodFigures figures={periodFigures} onPick={onPickFigure} />
    </aside>
  );
}
