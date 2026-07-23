import type { Dynasty } from "../../data/types";

interface DynastyNodeProps {
  dynasty: Dynasty;
  isActive: boolean;
  onClick: () => void;
}

function formatYear(y: number): string {
  if (y < 0) return "前" + Math.abs(y);
  if (y === 0) return "公元";
  return y.toString();
}

export function DynastyNode({ dynasty, isActive, onClick }: DynastyNodeProps) {
  return (
    <button
      type="button"
      className={`portal-station${isActive ? " active" : ""}${dynasty.is_active ? " available" : ""}`}
      style={{ width: "150px" }}
      onClick={onClick}
    >
      <span className="portal-station-name">{dynasty.name}</span>
      <span className="portal-station-dot" />
      <span className="portal-station-years">
        {formatYear(dynasty.start_year)}–{formatYear(dynasty.end_year)}
      </span>
    </button>
  );
}
