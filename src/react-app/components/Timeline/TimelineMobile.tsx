import type { TimelineData } from "../../data/types";
import { Header } from "../Common/Header";
import "./timeline.css";

interface TimelineMobileProps {
  data: TimelineData;
}

function formatYear(y: number): string {
  if (y < 0) return "前" + Math.abs(y);
  if (y === 0) return "公元";
  return y.toString();
}

/**
 * 移动端历史长河降级形态：竖向朝代列表（FRONTEND_ARCH §7）。
 * 不加载 Canvas 粒子，改为可滚动的卷轴列表，每个朝代一段。
 */
export function TimelineMobile({ data }: TimelineMobileProps) {
  const handleItemClick = (d: TimelineData["dynasties"][number]) => {
    if (!d.is_active) return;
    if (d.book_ids?.includes("shiji")) {
      window.location.href = "https://shiji.timeslip.work";
    }
    // 其他史书暂未开启穿越
  };

  return (
    <div className="timeline-mobile">
      <Header />
      <header className="timeline-mobile-hero">
        <h1 className="timeline-mobile-title">历史长河</h1>
        <p className="timeline-mobile-subtitle">一河贯古今 · 二十四史，逆流可溯</p>
      </header>
      <ol className="timeline-mobile-list">
        {data.dynasties.map((d) => (
          <li
            key={d.id}
            className={`timeline-mobile-item${d.is_active ? " active" : ""}`}
            onClick={() => handleItemClick(d)}
          >
            <div className="timeline-mobile-thumb">
              <img src={`assets/${d.img}`} alt={d.name} loading="lazy" />
            </div>
            <div className="timeline-mobile-body">
              <div className="timeline-mobile-meta">
                <span className="timeline-mobile-name">{d.name}</span>
                <span className="timeline-mobile-years">
                  {formatYear(d.start_year)}–{formatYear(d.end_year)}
                </span>
              </div>
              <div className="timeline-mobile-book">{d.book_label}</div>
              <p className="timeline-mobile-desc">{d.description || "敬请期待"}</p>
              <span className="timeline-mobile-cta">
                {d.is_active && d.book_ids?.includes("shiji") ? "立即穿越 →" : "尚未开启"}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
