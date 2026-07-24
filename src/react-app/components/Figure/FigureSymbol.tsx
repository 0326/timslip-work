// 人物身份剪影占位。在真实头像缺失/加载失败时显示，按 identity 取对应身份剪影图。
// 真实头像到位后由 <img> 覆盖，本组件作底层兜底，永不空。

const IDENTITY_COLOR: Record<string, string> = {
  帝王: "#c23a2b", // 朱砂
  将相: "#33414f", // 墨青
  文人: "#2e6b6b", // 靛
  谋士: "#5a4a72", // 黛紫
  刺客: "#3a2f2f", // 玄
  后妃: "#9a4f63", // 绛
  游侠: "#8a6a32", // 黄褐
  异族: "#7a5638", // 大地褐
  宦官: "#4a5a4a", // 深苍
};

// 身份 → 剪影图路径
const IDENTITY_SILHOUETTE: Record<string, string> = {
  帝王: "/assets/silhouettes/diwang.jpg",
  将相: "/assets/silhouettes/jiangxiang.jpg",
  文人: "/assets/silhouettes/wenren.jpg",
  谋士: "/assets/silhouettes/moushi.jpg",
  刺客: "/assets/silhouettes/cike.jpg",
  后妃: "/assets/silhouettes/houfei.jpg",
  游侠: "/assets/silhouettes/youxia.jpg",
  异族: "/assets/silhouettes/yizu.jpg",
  宦官: "/assets/silhouettes/huanguan.jpg",
};

// 小量身份 → 主身份映射（用于 fallback）
const IDENTITY_FALLBACK: Record<string, string> = {
  將相: "将相", // 繁体变体
  佞幸: "宦官",
  外戚: "将相",
  异人: "游侠",
  恩幸: "后妃",
  隐逸: "文人",
};

function getSilhouettePath(identity?: string | null): string {
  if (!identity) return IDENTITY_SILHOUETTE["文人"];
  if (IDENTITY_SILHOUETTE[identity]) return IDENTITY_SILHOUETTE[identity];
  const fallback = IDENTITY_FALLBACK[identity];
  if (fallback && IDENTITY_SILHOUETTE[fallback]) return IDENTITY_SILHOUETTE[fallback];
  return IDENTITY_SILHOUETTE["文人"];
}

export function FigureSymbol({
  identity,
  className,
}: {
  icon?: string | null;
  identity?: string | null;
  className?: string;
}) {
  const color = (identity && IDENTITY_COLOR[identity]) || "#8a7e6e";
  const silhouettePath = getSilhouettePath(identity);
  return (
    <div
      className={`figure-symbol${className ? " " + className : ""}`}
      style={{ ["--sym" as string]: color }}
      aria-hidden="true"
    >
      <img
        src={silhouettePath}
        alt=""
        className="figure-silhouette-img"
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}
