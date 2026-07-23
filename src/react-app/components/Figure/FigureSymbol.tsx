// 人物身份符号占位（PRD §5.2）。在真实头像缺失/加载失败时显示，按 avatar_icon 取符号、
// 按 identity 取配色。真实头像到位后由 <img> 覆盖，本组件作底层兜底，永不空。

const IDENTITY_COLOR: Record<string, string> = {
  帝王: "#c23a2b", // 朱砂
  将相: "#33414f", // 墨青
  文人: "#2e6b6b", // 靛
  谋士: "#5a4a72", // 黛紫
  刺客: "#3a2f2f", // 玄
  后妃: "#9a4f63", // 绛
  游侠: "#8a6a32", // 黄褐
  异族: "#7a5638", // 大地褐
};

// viewBox 0 0 48 48，简笔国风符号
const ICONS: Record<string, React.ReactNode> = {
  crown: <path d="M8 34h32l-3 6H11l-3-6zM8 34l-2-16 9 7 9-13 9 13 9-7-2 16H8z" />,
  sword: (
    <g>
      <path d="M24 4l4 28h-8l4-28z" />
      <path d="M14 32h20v4H14z" />
      <path d="M22 36h4v8h-4z" />
    </g>
  ),
  scroll: (
    <g>
      <path d="M12 8h24v32H12z" fill="none" strokeWidth="3" />
      <path d="M17 17h14M17 24h14M17 31h9" strokeWidth="2.5" fill="none" />
    </g>
  ),
  chess: (
    <g>
      <circle cx="24" cy="24" r="16" fill="none" strokeWidth="3" />
      <path d="M24 12v24M12 24h24" strokeWidth="2.5" />
    </g>
  ),
  dagger: (
    <g>
      <path d="M24 4l3 24h-6l3-24z" />
      <path d="M16 28h16v3H16z" />
      <path d="M23 31h2v13h-2z" />
    </g>
  ),
  lantern: (
    <g>
      <path d="M24 6v4M18 10h12" strokeWidth="2.5" />
      <ellipse cx="24" cy="26" rx="11" ry="14" fill="none" strokeWidth="3" />
      <path d="M24 40v3" strokeWidth="2.5" />
    </g>
  ),
  horse: (
    <path d="M14 40c0-12 4-18 10-22-2-3-1-7 2-9 1 4 4 5 7 6 4 2 6 6 6 13 0 5-2 9-5 12h-5c2-3 3-6 3-10 0-5-3-8-7-7-5 1-6 8-6 17h-5z" />
  ),
  person: (
    <g>
      <circle cx="24" cy="16" r="8" fill="none" strokeWidth="3" />
      <path d="M10 42c0-9 6-14 14-14s14 5 14 14" fill="none" strokeWidth="3" />
    </g>
  ),
};

export function FigureSymbol({
  icon,
  identity,
  className,
}: {
  icon?: string | null;
  identity?: string | null;
  className?: string;
}) {
  const color = (identity && IDENTITY_COLOR[identity]) || "#8a7e6e";
  const node = (icon && ICONS[icon]) || ICONS.person;
  return (
    <div
      className={`figure-symbol${className ? " " + className : ""}`}
      style={{ ["--sym" as string]: color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" stroke={color} fill={color} strokeLinejoin="round" strokeLinecap="round">
        {node}
      </svg>
    </div>
  );
}
