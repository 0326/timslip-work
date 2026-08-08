import type {
  TimelineData,
  SearchResponse,
  Passage,
  Book,
  Volume,
  BookCatalog,
  ChapterDetail,
  ApiError,
  FigureListResponse,
  FigureDetail,
  FigureRelation,
  FigureAsset,
  FigureAssetsResponse,
  ArtStylesResponse,
  AssetType,
  GraphData,
} from "./types";
import { TIMELINE_DATA } from "./timeline";

const BASE = "/api";

// === 分级缓存策略 ===
// 按数据变动频率分三档 TTL，减少不必要的后端请求
const TTL_STATIC = Infinity;        // 静态：二十四史/目录/篇章，session 级永久
const TTL_SEMI = 30 * 60 * 1000;    // 半静态：段落/人物/关系图，30 分钟
const TTL_DYNAMIC = 5 * 60 * 1000;  // 动态：搜索/列表分页，5 分钟

const cache = new Map<string, { data: unknown; ts: number; ttl: number }>();
const inflight = new Map<string, Promise<unknown>>();

// === localStorage 持久化（跨会话缓存静态数据）===
const LS_PREFIX = "api-cache:";
const LS_VERSION = "v10";

function lsRead<T>(url: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + LS_VERSION + ":" + url);
    if (!raw) return;
    return JSON.parse(raw) as T;
  } catch {
    return;
  }
}

function lsWrite(url: string, data: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + LS_VERSION + ":" + url, JSON.stringify(data));
  } catch {
    // localStorage 满或不可用，静默降级
  }
}

/** 同步读取缓存（未过期则返回数据，否则 undefined） */
export function peekCache<T>(url: string): T | undefined {
  const entry = cache.get(url);
  if (entry && (entry.ttl === Infinity || Date.now() - entry.ts < entry.ttl)) {
    return entry.data as T;
  }
  // 内存未命中，尝试 localStorage（仅静态数据写入过）
  const lsData = lsRead<T>(url);
  if (lsData !== undefined) {
    // 回填内存缓存，ttl 标记为 Infinity 避免反复读 LS
    cache.set(url, { data: lsData, ts: Date.now(), ttl: Infinity });
    return lsData;
  }
  return undefined;
}

/**
 * 统一请求函数，支持分级 TTL。
 * - ttl=Infinity 时同时写入 localStorage，跨会话命中
 * - inflight 合并并发重复请求
 */
function request<T>(url: string, ttl: number = TTL_DYNAMIC): Promise<T> {
  // 1. 合并并发重复请求
  if (inflight.has(url)) {
    return inflight.get(url) as Promise<T>;
  }

  // 2. 命中未过期内存缓存
  const cached = cache.get(url);
  if (cached && (cached.ttl === Infinity || Date.now() - cached.ts < cached.ttl)) {
    return Promise.resolve(cached.data as T);
  }

  // 3. 静态数据尝试 localStorage
  if (ttl === Infinity) {
    const lsData = lsRead<T>(url);
    if (lsData !== undefined) {
      cache.set(url, { data: lsData, ts: Date.now(), ttl: Infinity });
      return Promise.resolve(lsData);
    }
  }

  // 4. 发起新请求
  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        let err: ApiError;
        try {
          err = (await res.json()) as ApiError;
        } catch {
          err = { error: { code: "UNKNOWN", message: res.statusText } };
        }
        throw err;
      }
      return res.json();
    })
    .then((data) => {
      cache.set(url, { data, ts: Date.now(), ttl });
      if (ttl === Infinity) lsWrite(url, data);
      inflight.delete(url);
      return data as T;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, promise);
  return promise;
}

// 对外暴露的分级请求函数（供未来直接调用）
export function requestStatic<T>(url: string): Promise<T> {
  return request<T>(url, TTL_STATIC);
}
export function requestSemiStatic<T>(url: string): Promise<T> {
  return request<T>(url, TTL_SEMI);
}

// 时间轴改用本地静态配置（见 ./timeline.ts），不再走 /api/timeline，
// 避免接口 pending/超时拖住首页首屏。数据极少变动，需要时重新导出即可。
export function getTimeline(): Promise<TimelineData> {
  return Promise.resolve(TIMELINE_DATA);
}

export function search(
  query: string,
  opts?: { book?: string; page?: number; limit?: number },
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (opts?.book) params.set("book", opts.book);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  return request<SearchResponse>(`${BASE}/search?${params}`);
}

export function getPassage(id: string): Promise<Passage> {
  return request<Passage>(`${BASE}/text/${id}`, TTL_SEMI);
}

export function getBooks(): Promise<{ books: Book[] }> {
  return request<{ books: Book[] }>(`${BASE}/books`, TTL_STATIC);
}

export function getBook(
  id: string,
): Promise<Book & { volumes: Volume[] }> {
  return request<Book & { volumes: Volume[] }>(`${BASE}/books/${id}`, TTL_STATIC);
}

export function getBookCatalog(id: string): Promise<BookCatalog> {
  return request<BookCatalog>(`${BASE}/books/${id}/catalog`, TTL_STATIC);
}

export function getChapter(id: string): Promise<ChapterDetail> {
  return request<ChapterDetail>(`${BASE}/chapters/${id}`, TTL_STATIC);
}

export function getFigures(opts?: {
  page?: number;
  limit?: number;
  dynasty?: string;
  identity?: string;
  q?: string;
  sort?: "era" | "star";
  minStar?: number;
}): Promise<FigureListResponse> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.dynasty) params.set("dynasty", opts.dynasty);
  if (opts?.identity) params.set("identity", opts.identity);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.minStar) params.set("minStar", String(opts.minStar));
  return request<FigureListResponse>(`${BASE}/figures?${params}`);
}

export function getFigure(id: string): Promise<FigureDetail> {
  return request<FigureDetail>(`${BASE}/figures/${id}`, TTL_SEMI);
}

export function getFigureRelations(id: string): Promise<{ relations: FigureRelation[] }> {
  return request<{ relations: FigureRelation[] }>(`${BASE}/figures/${id}/relations`, TTL_SEMI);
}

// === 人物视觉资产 API ===

export function getArtStyles(): Promise<ArtStylesResponse> {
  return request<ArtStylesResponse>(`${BASE}/art-styles`, TTL_STATIC);
}

export function getFigureAssets(id: string): Promise<FigureAssetsResponse> {
  return request<FigureAssetsResponse>(`${BASE}/figures/${id}/assets`, TTL_SEMI);
}

/** 关系图数据：节点+边，半静态缓存（30min）
 *  focus + depth：返回该节点的 N 跳自我子图（≤300 节点，秒开）
 *  仅 focus（无 depth）：全量 top-N 图，但确保 focus 节点包含在内
 */
export function getFigureGraph(
  top: number = 2000,
  focus?: string,
  depth?: number,
): Promise<GraphData> {
  const params = new URLSearchParams();
  params.set("top", String(top));
  if (focus) {
    params.set("focus", focus);
    if (depth) params.set("depth", String(depth));
  }
  return request<GraphData>(`${BASE}/figures/graph?${params.toString()}`, TTL_SEMI);
}

export function getFigureAssetStyle(
  id: string,
  style: string,
  opts?: { type?: AssetType },
): Promise<FigureAsset> {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  const qs = params.toString();
  return request<FigureAsset>(`${BASE}/figures/${id}/assets/${style}${qs ? `?${qs}` : ""}`);
}

/**
 * 从 FigureAsset 中获取指定类型的默认/第一个文件 URL
 * 便捷工具：组件里直接拿头像/立绘/背景
 */
export function getAssetFileUrl(
  asset: FigureAsset | undefined,
  type: AssetType,
  variant: string = "default",
): string | null {
  if (!asset) return null;
  const file = asset.files.find(
    (f) => f.asset_type === type && f.variant === variant,
  ) ?? asset.files.find((f) => f.asset_type === type);
  return file?.url ?? null;
}
