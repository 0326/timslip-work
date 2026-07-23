/**
 * 人物视觉资产解析工具
 *
 * 开发阶段：使用本地 public/assets/figures/ 下的静态资源。
 *   本地目录约定：figures/{figure_id}/{style_id}/{type}/ 或 figures/{figure_id}/{style_id}/{type}-{variant}.{ext}
 *   当前项羽素材命名：portrait/full-default.jpg、portrait/bust-default.jpg、avatar/default.jpg、background/default.jpg
 *
 * 生产阶段：切换为读取 /api/figures/:id/assets 返回的数据（结构相同）。
 *   getFigureAssetBundle() 会优先从 API 拉，失败则 fallback 到本地静态兜底。
 */
import type { AssetType, FigureAsset, AssetFile } from "./types";

const STATIC_BASE = "/assets";

/**
 * 本地已存在的静态资产清单。
 * 新增人物时只需在此表添加条目，前端即可显示新素材。
 * 未来 R2 上线后此表作为离线兜底即可。
 */
interface StaticAssetEntry {
  figureId: string;
  styleId: string;
  isDefault?: boolean;
  files: Array<{
    type: AssetType;
    variant?: string;
    ext?: string; // 默认 jpg
    /**
     * 可选：显式指定文件名（不含扩展名）。
     * 若不指定，则默认：
     *   - avatar/background/expression 等单图类型使用 variant 作为文件名
     *   - portrait-bust 使用 bust-{variant}
     *   - portrait-full 使用 full-{variant}
     */
    fileKey?: string;
  }>;
}

const STATIC_ASSET_MANIFEST: StaticAssetEntry[] = [
  // 注：xiangyu/qinshihuang/kongzi 等已通过 R2 + /api/figures/:id/assets 提供，
  // 不再需要静态兜底条目。新增人物也无需在此添加——上传到 R2 后前端自动加载。
];

/** 根据类型和 variant 推导默认文件名（不含扩展名） */
function defaultFileKey(t: AssetType, variant: string): string {
  switch (t) {
    case "portrait-bust": return `bust-${variant}`;
    case "portrait-full": return `full-${variant}`;
    default: return variant;
  }
}

/** 把静态 manifest 条目转换为运行时 FigureAsset 结构 */
function buildStaticAsset(entry: StaticAssetEntry): FigureAsset {
  const files: AssetFile[] = entry.files.map((f) => {
    const variant = f.variant || "default";
    const ext = f.ext || "jpg";
    const folder = typeToFolder(f.type);
    const fileKey = f.fileKey ?? defaultFileKey(f.type, variant);
    const r2Key = `figures/${entry.figureId}/${entry.styleId}/${folder}/${fileKey}.${ext}`;
    return {
      id: `${entry.figureId}:${entry.styleId}:${f.type}:${variant}`,
      asset_id: `${entry.figureId}:${entry.styleId}`,
      asset_type: f.type,
      variant,
      r2_key: r2Key,
      url: `${STATIC_BASE}/${r2Key}`,
      mime_type: ext === "png" ? "image/png" : "image/jpeg",
      width: null,
      height: null,
      size_bytes: null,
      sort_order: 0,
      metadata: null,
      created_at: 0,
    };
  });
  return {
    id: `${entry.figureId}:${entry.styleId}`,
    figure_id: entry.figureId,
    style_id: entry.styleId,
    style_name: styleIdToName(entry.styleId),
    is_default: !!entry.isDefault,
    creator: "static",
    status: "active",
    metadata: null,
    created_at: 0,
    updated_at: 0,
    files,
  };
}

function typeToFolder(t: AssetType): string {
  switch (t) {
    case "avatar": return "avatar";
    case "portrait-bust":
    case "portrait-full":
      return "portrait";
    case "background": return "background";
    case "cg": return "cg";
    case "chibi": return "chibi";
    case "spine": return "spine";
    case "expression": return "expression";
    case "extra": return "extra";
    default: return "extra";
  }
}

function styleIdToName(id: string): string {
  const map: Record<string, string> = {
    classical: "国风",
    anime: "二次元",
    realistic: "写实",
    chibi: "Q版",
  };
  return map[id] || id;
}

/** 把 static manifest 按 figureId 建索引 */
const staticByFigure = new Map<string, Map<string, FigureAsset>>();
for (const entry of STATIC_ASSET_MANIFEST) {
  if (!staticByFigure.has(entry.figureId)) {
    staticByFigure.set(entry.figureId, new Map());
  }
  staticByFigure.get(entry.figureId)!.set(entry.styleId, buildStaticAsset(entry));
}

/**
 * 同步获取某人物的静态资产 bundle（无网络请求）。
 * 用于列表/详情页首帧渲染，避免闪烁。
 */
export function getLocalFigureAssets(figureId: string): {
  defaultStyle: string | null;
  assets: Record<string, FigureAsset>;
} | null {
  const map = staticByFigure.get(figureId);
  if (!map) return null;
  const assets: Record<string, FigureAsset> = {};
  let defaultStyle: string | null = null;
  for (const [styleId, asset] of map) {
    assets[styleId] = asset;
    if (asset.is_default && !defaultStyle) defaultStyle = styleId;
  }
  return { defaultStyle: defaultStyle ?? [...map.keys()][0] ?? null, assets };
}

/**
 * 从一个 FigureAsset 中取出指定类型的文件 URL（便捷方法）。
 * variant 不传则取 default，没有 default 取该类型第一个文件。
 */
export function pickAssetFile(
  asset: FigureAsset | undefined,
  type: AssetType,
  variant: string = "default",
): string | null {
  if (!asset) return null;
  const file =
    asset.files.find((f) => f.asset_type === type && f.variant === variant) ??
    asset.files.find((f) => f.asset_type === type);
  return file?.url ?? null;
}

/**
 * 给 R2 图片 URL 追加 ?w=<宽> 触发 worker 端 webp + 按宽缩放（见 /api/asset 处理）。
 * 仅对 /api/asset/ 生效；本地 /assets/ 静态兜底原样返回（由 CF 静态资源直出，不过 worker）。
 */
export function sizedAssetUrl(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  if (!url.startsWith("/api/asset/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}`;
}

// ─── R2 在线资产拉取 & 合并 ─────────────────────────────────
// 策略：首帧用本地静态 bundle 立即渲染，后台异步 fetch API 版本；
// API 返回后，按 (type, variant) 维度覆盖本地同名文件，API 新增的文件追加，
// 本地有但 API 没有的文件保留作为离线兜底。

export interface FigureBundle {
  defaultStyle: string | null;
  assets: Record<string, FigureAsset>;
  /** 数据来源：local=仅本地兜底，api=已从 API 拉到 R2 版本 */
  source: "local" | "api";
}

/**
 * 异步拉取 R2 资产 bundle（GET /api/figures/:id/assets）。
 * 失败时返回 null（由调用方决定是否保留本地 bundle）。
 */
export async function fetchFigureBundle(figureId: string): Promise<FigureBundle | null> {
  try {
    const res = await fetch(`/api/figures/${encodeURIComponent(figureId)}/assets`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      figure_id: string;
      default_style: string | null;
      assets: Record<string, FigureAsset>;
    };
    if (!data.assets || typeof data.assets !== "object") return null;
    return {
      defaultStyle: data.default_style,
      assets: data.assets,
      source: "api",
    };
  } catch {
    return null;
  }
}

/**
 * 把 API 返回的 R2 bundle 合并到本地 bundle 上：
 * - 同 style 下按 (asset_type, variant) 覆盖/追加文件
 * - API 新增的 style 整体加入
 * - 本地有但 API 没有的 style/file 保留（离线兜底）
 */
export function mergeBundles(local: FigureBundle | null, remote: FigureBundle | null): FigureBundle {
  if (!remote) return local ?? emptyBundle();
  if (!local) return remote;
  const assets: Record<string, FigureAsset> = { ...local.assets };
  for (const [styleId, rAsset] of Object.entries(remote.assets)) {
    const lAsset = assets[styleId];
    if (!lAsset) {
      assets[styleId] = rAsset;
      continue;
    }
    // 合并 files：以 (type, variant) 为 key，remote 覆盖 local
    const fileMap = new Map<string, AssetFile>();
    for (const f of lAsset.files) fileMap.set(`${f.asset_type}:${f.variant}`, f);
    for (const f of rAsset.files) fileMap.set(`${f.asset_type}:${f.variant}`, f);
    assets[styleId] = {
      ...lAsset,
      ...rAsset,
      files: [...fileMap.values()],
      // is_default 以 remote 为准（若 remote 明确设定）
      is_default: rAsset.is_default ?? lAsset.is_default,
    };
  }
  return {
    defaultStyle: remote.defaultStyle ?? local.defaultStyle,
    assets,
    source: "api",
  };
}

function emptyBundle(): FigureBundle {
  return { defaultStyle: null, assets: {}, source: "local" };
}

/**
 * 把同步的 getLocalFigureAssets() 结果包装成 FigureBundle 结构。
 */
export function localBundleAsFigureBundle(figureId: string): FigureBundle {
  const b = getLocalFigureAssets(figureId);
  if (!b) return emptyBundle();
  return { defaultStyle: b.defaultStyle, assets: b.assets, source: "local" };
}
