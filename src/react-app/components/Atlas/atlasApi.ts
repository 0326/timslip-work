// 舆图富化 API 客户端。
// 基础数据（帧索引、疆域、都城、人物钉）来自静态 public/atlas/*（CDN，永远可用）；
// 本模块只取 /api/atlas 的「富化层」：人物 figure_id 深链 + 同期史册人物。
// API 不可用（如纯静态部署）时静默降级，地图仍完整可用。

import type { AtlasFigure, AtlasPeriodFigure, AtlasSnapshotDetail } from "./types";

// 疆域/底图 GeoJSON 基址。默认静态 /atlas（Cloudflare 静态资源即 CDN，
// 对 ~250KB 小文件比走 Worker+R2 更快）。如需从 R2 读，构建时设 VITE_ATLAS_BASE=/api/asset/atlas。
export const ATLAS_BASE = import.meta.env.VITE_ATLAS_BASE || "/atlas";

interface ApiFigureMarker {
  name: string;
  lng: number;
  lat: number;
  place_name: string | null;
  note: string | null;
  figure_id: string | null;
  identity: string | null;
  avatar_icon: string | null;
  birth_year: number | null;
  death_year: number | null;
}

interface ApiPeriodFigure {
  id: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  dynasty: string;
  identity: string;
  avatar_icon: string | null;
}

interface ApiSnapshotDetail {
  figures: ApiFigureMarker[];
  periodFigures: ApiPeriodFigure[];
}

const detailCache = new Map<string, Promise<AtlasSnapshotDetail | null>>();

async function fetchDetail(slug: string): Promise<AtlasSnapshotDetail | null> {
  try {
    const res = await fetch(`/api/atlas/snapshots/${slug}`);
    if (!res.ok) return null;
    const d = (await res.json()) as ApiSnapshotDetail;
    const figures: AtlasFigure[] = (d.figures ?? []).map((f) => ({
      name: f.name,
      at: [f.lng, f.lat],
      place: f.place_name ?? "",
      note: f.note ?? "",
      figureId: f.figure_id,
      identity: f.identity,
      avatarIcon: f.avatar_icon,
    }));
    const periodFigures: AtlasPeriodFigure[] = (d.periodFigures ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      birthYear: f.birth_year,
      deathYear: f.death_year,
      dynasty: f.dynasty,
      identity: f.identity,
      avatarIcon: f.avatar_icon,
    }));
    return { figures, periodFigures };
  } catch {
    return null;
  }
}

/** 取某帧富化详情（带缓存）；失败/不可用返回 null，调用方降级即可 */
export function getAtlasDetail(slug: string): Promise<AtlasSnapshotDetail | null> {
  if (!detailCache.has(slug)) detailCache.set(slug, fetchDetail(slug));
  return detailCache.get(slug)!;
}
