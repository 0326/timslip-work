import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { getDb } from "./db";
import { auth as authRoutes } from "./routes/auth";
import { user as userRoutes } from "./routes/user";
import type {
  Passage,
  Book,
  Volume,
  CatalogChapter,
  BookCatalog,
  ChapterDetail,
  Dynasty,
  TimelineData,
  SearchResponse,
  Gloss,
  Figure,
  FigurePassage,
  FigureRelation,
  FigureListResponse,
  FigureDetail,
  ArtStyle,
  AssetFile,
  FigureAsset,
  AssetType,
  AssetFileMetadata,
  AtlasSnapshotMeta,
  AtlasCapitalMarker,
  AtlasFigureMarker,
  AtlasPeriodFigure,
  AtlasSnapshotDetail,
  AtlasIndexResponse,
} from "./types";

const app = new Hono<{ Bindings: Env }>();

// 全局错误兜底：未捕获的异常统一返回 JSON 500 而非裸 text
app.onError((err, c) => {
  const status = (err as any)?.status ?? 500;
  const message = status === 500
    ? "Internal Server Error"
    : (err instanceof Error ? err.message : String(err));
  // 500 时打印完整堆栈到 console（Workers real-time logs 可查）
  if (status === 500) console.error("[unhandled]", err);
  c.header("Content-Type", "application/json");
  return c.json({ error: { code: "INTERNAL_ERROR", message } }, status as 500);
});

// CORS：仅允许主站及子游戏域名跨域调用
const ALLOWED_ORIGINS = [
  "https://timeslip.work",
  "https://www.timeslip.work",
  "https://shiji.timeslip.work",
  "http://localhost:5173",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".timeslip.work");
  } catch {
    return false;
  }
}

app.use("/api/*", cors({
  origin: (origin) => (origin && isAllowedOrigin(origin) ? origin : null),
  credentials: true,
}));

// 全局限流：100 req/min per IP（仅当 RATE_LIMITER 绑定存在时启用；
// 本地/未配置绑定时优雅跳过，避免 c.env.RATE_LIMITER 为 undefined 导致 500）
app.use("/api/*", async (c, next) => {
  const limiter = (c.env as unknown as Record<string, unknown>).RATE_LIMITER as
    | { limit: (o: { key: string }) => Promise<{ success: boolean }> }
    | undefined;
  if (limiter) {
    const ip = c.req.header("cf-connecting-ip") || "anonymous";
    const { success } = await limiter.limit({ key: ip });
    if (!success) {
      return errorResponse("RATE_LIMITED", "Too many requests", 429);
    }
  }
  await next();
});

// ── bigram 工具（与数据管线一致） ──
function toBigrams(s: string): string {
  const t = (s || "").replace(/\s+/g, "");
  if (t.length < 2) return t;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out.join(" ");
}

// ── HTML 转义 + 从「干净原文」生成检索摘要与高亮 ──
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightSnippet(
  content: string,
  q: string,
): { snippet: string; highlight: string } {
  const text = (content || "").replace(/\s+/g, "");
  const term = (q || "").replace(/\s+/g, "");
  const WINDOW = 64;
  const idx = term ? text.indexOf(term) : -1;
  const start = idx > 12 ? idx - 12 : 0;
  const seg = text.slice(start, start + WINDOW);
  const snippet =
    (start > 0 ? "…" : "") + seg + (start + WINDOW < text.length ? "…" : "");

  let highlight = escapeHtml(snippet);
  if (term) {
    const escTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    highlight = highlight.replace(
      new RegExp(escTerm, "g"),
      `<em>${escapeHtml(term)}</em>`,
    );
  }
  return { snippet, highlight };
}

// ── 错误辅助 ──
function errorResponse(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── 反序列化 dynasty 行（book_ids JSON → array, is_active 0/1 → boolean） ──
function deserializeDynasty(row: Record<string, unknown>): Dynasty {
  return {
    id: row.id as string,
    name: row.name as string,
    start_year: row.start_year as number,
    end_year: row.end_year as number,
    book_ids: row.book_ids ? JSON.parse(row.book_ids as string) : [],
    book_label: row.book_label as string,
    img: row.img as string,
    description: row.description as string,
    is_active: !!row.is_active,
  };
}

// ── KV 安全包装：带超时的 get/put ──
// 生产环境 KV <50ms 无感；本地 dev 若 KV 绑定为 remote 且无 cloudflare 网络会挂起，
// 用 Promise.race 超时降级，避免整个请求卡死（回源查库）。
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function kvGetSafe(env: Env, key: string, ms = 800): Promise<string | null> {
  try {
    return await withTimeout(env.KV.get(key), ms);
  } catch {
    return null;
  }
}

function kvPutSafe(c: Context<{ Bindings: Env }>, key: string, value: string, ttl = 604800): void {
  // 用 waitUntil 让写入在响应返回后继续完成——否则 Workers 会取消未 await 的异步写，
  // 导致缓存永远写不进去（表现为每次都 MISS，仍回源打库）。写失败无所谓，下次再写。
  try {
    c.executionCtx.waitUntil(c.env.KV.put(key, value, { expirationTtl: ttl }).catch(() => {}));
  } catch {
    /* 无 executionCtx（本地某些场景）/ KV 不可用 */
  }
}

// ── 反序列化 passage 行（glosses JSON → array） ──
function deserializePassage(row: Record<string, unknown>): Passage {
  return {
    id: row.id as string,
    chapter_id: row.chapter_id as string,
    section_id: (row.section_id as string) || null,
    content: row.content as string,
    annotation: (row.annotation as string) || null,
    glosses: row.glosses ? (JSON.parse(row.glosses as string) as Gloss[]) : null,
    vernacular: (row.vernacular as string) || null,
    order_idx: row.order_idx as number,
    version: row.version as number,
  };
}

// ════════════════════════════════════════════
// 路由实现
// ════════════════════════════════════════════

// 健康检查
app.get("/api/health", (c) =>
  c.json({ status: "ok", version: "0.1.0", time: new Date().toISOString() }),
);

// 按 ID 取原文（KV 缓存，TTL 7天）—— id 含斜杠，必须用 :id{.+}
app.get("/api/text/:id{.+}", async (c) => {
  const id = c.req.param("id");

  // ID 格式校验
  if (!/^[\w/]+\/p\d+$/.test(id) && !/^[\w/]+$/.test(id)) {
    return errorResponse("INVALID_ID", "Invalid ID format", 422);
  }

  // 查 KV
  try {
    const cached = await c.env.KV.get(`passage:${id}`);
    if (cached) return c.json(JSON.parse(cached));
  } catch { /* KV unavailable, fall through */ }

  // 查 D1
  const row = await getDb(c.env).prepare(
    "SELECT id, chapter_id, section_id, content, annotation, glosses, vernacular, order_idx, version FROM passages WHERE id = ?",
  )
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) {
    return errorResponse("NOT_FOUND", "Passage not found", 404);
  }

  const passage = deserializePassage(row);

  // 写 KV
  try {
    await c.env.KV.put(`passage:${id}`, JSON.stringify(passage), { expirationTtl: 604800 });
  } catch { /* KV unavailable, skip write */ }

  return c.json(passage);
});

// 全文检索（额外限流：20 req/min per IP）
app.get("/api/search", async (c) => {
  // 搜索接口限流（仅当 SEARCH_LIMITER 绑定存在时启用，本地优雅跳过）
  const searchLimiter = (c.env as unknown as Record<string, unknown>).SEARCH_LIMITER as
    | { limit: (o: { key: string }) => Promise<{ success: boolean }> }
    | undefined;
  if (searchLimiter) {
    const ip = c.req.header("cf-connecting-ip") || "anonymous";
    const { success } = await searchLimiter.limit({ key: ip });
    if (!success) {
      return errorResponse("RATE_LIMITED", "Too many search requests", 429);
    }
  }

  const q = c.req.query("q");
  const book = c.req.query("book");
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  if (!q) {
    return errorResponse("BAD_REQUEST", "Missing query param: q", 400);
  }

  const term = q.replace(/\s+/g, "");
  const isSingleChar = term.length < 2;

  // 原始行：含干净原文与书名/篇名，摘要与高亮在 JS 端基于干净原文生成
  interface SearchRow {
    passage_id: string;
    book_id: string;
    content: string;
    book_name: string | null;
    chapter_name: string | null;
  }

  let rows: SearchRow[];
  let total: number;

  if (isSingleChar) {
    // 单字查询：bigram 无法匹配，走 LIKE 兜底
    const likePattern = `%${term}%`;
    const countSql = `SELECT COUNT(*) as total FROM passages p WHERE p.content LIKE ?${book ? " AND p.chapter_id LIKE ?" : ""}`;
    const countParams = book ? [likePattern, `${book}/%`] : [likePattern];
    const countResult = await getDb(c.env).prepare(countSql)
      .bind(...countParams)
      .first<{ total: number }>();
    total = countResult?.total || 0;

    let sql = `
      SELECT p.id as passage_id, b.id as book_id, p.content,
        b.name as book_name, c.name as chapter_name
      FROM passages p
      LEFT JOIN chapters c ON c.id = p.chapter_id
      LEFT JOIN volumes v ON v.id = c.volume_id
      LEFT JOIN books b ON b.id = v.book_id
      WHERE p.content LIKE ?
    `;
    const params: (string | number)[] = [likePattern];
    if (book) {
      sql += " AND p.chapter_id LIKE ?";
      params.push(`${book}/%`);
    }
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const result = await getDb(c.env).prepare(sql).bind(...params).all();
    rows = result.results as unknown as SearchRow[];
  } else {
    // 多字查询：bigram MATCH，JOIN 回 passages 取干净原文
    const matchExpr = toBigrams(q);
    const countSql = `SELECT COUNT(*) as total FROM search_index WHERE content_bigram MATCH ?${book ? " AND book_id = ?" : ""}`;
    const countParams = book ? [matchExpr, book] : [matchExpr];
    const countResult = await getDb(c.env).prepare(countSql)
      .bind(...countParams)
      .first<{ total: number }>();
    total = countResult?.total || 0;

    let sql = `
      SELECT si.passage_id, si.book_id, p.content,
        b.name as book_name, c.name as chapter_name
      FROM search_index si
      JOIN passages p ON p.id = si.passage_id
      LEFT JOIN chapters c ON c.id = p.chapter_id
      LEFT JOIN books b ON b.id = si.book_id
      WHERE si.content_bigram MATCH ?
    `;
    const params: (string | number)[] = [matchExpr];
    if (book) {
      sql += " AND si.book_id = ?";
      params.push(book);
    }
    sql += " ORDER BY bm25(search_index) LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const result = await getDb(c.env).prepare(sql).bind(...params).all();
    rows = result.results as unknown as SearchRow[];
  }

  const results = rows.map((r) => {
    const { snippet, highlight } = highlightSnippet(r.content, q);
    return {
      passage_id: r.passage_id,
      book_id: r.book_id,
      book_name: r.book_name || r.book_id,
      chapter_name: r.chapter_name || "",
      snippet,
      highlight,
    };
  });

  return c.json({
    query: q,
    total,
    page,
    limit,
    results,
  } satisfies SearchResponse);
});

// 时间轴数据（KV 缓存）
app.get("/api/timeline", async (c) => {
  try {
    const cached = await c.env.KV.get("timeline:dynasties");
    if (cached) return c.json(JSON.parse(cached));
  } catch { /* KV unavailable, fall through */ }

  const dynastiesResult = await getDb(c.env).prepare(
    "SELECT * FROM dynasties ORDER BY start_year",
  ).all();

  const eventsResult = await getDb(c.env).prepare(
    "SELECT * FROM events ORDER BY year",
  ).all();

  const dynasties = dynastiesResult.results.map((r) =>
    deserializeDynasty(r as Record<string, unknown>),
  );

  const data: TimelineData = {
    range: {
      start: dynasties.length > 0 ? dynasties[0].start_year : -2600,
      end: dynasties.length > 0 ? dynasties[dynasties.length - 1].end_year : 1650,
    },
    dynasties,
    events: eventsResult.results as unknown as TimelineData["events"],
  };

  try {
    await c.env.KV.put("timeline:dynasties", JSON.stringify(data), { expirationTtl: 604800 });
  } catch { /* KV unavailable, skip write */ }

  return c.json(data);
});

// 二十四史列表
app.get("/api/books", async (c) => {
  // 附带已导入卷数 imported_volumes（>0 即原文已收录、可检索），供前端区分"可检索/待修"
  const books = await getDb(c.env).prepare(
    `SELECT b.*, (SELECT COUNT(*) FROM volumes v WHERE v.book_id = b.id) AS imported_volumes
     FROM books b ORDER BY b.sort_order`,
  ).all();
  return c.json({ books: books.results as unknown as Book[] });
});

// 单本书详情
app.get("/api/books/:id", async (c) => {
  const id = c.req.param("id");
  const book = await getDb(c.env).prepare("SELECT * FROM books WHERE id = ?")
    .bind(id)
    .first();

  if (!book) {
    return errorResponse("NOT_FOUND", "Book not found", 404);
  }

  const volumes = await getDb(c.env).prepare(
    "SELECT id, book_id, name, volume_no, category FROM volumes WHERE book_id = ? ORDER BY volume_no",
  )
    .bind(id)
    .all();

  return c.json({ ...book, volumes: volumes.results as unknown as Volume[] });
});

// 某书卷目列表
app.get("/api/books/:id/volumes", async (c) => {
  const id = c.req.param("id");
  const volumes = await getDb(c.env).prepare(
    "SELECT id, book_id, name, volume_no, category FROM volumes WHERE book_id = ? ORDER BY volume_no",
  )
    .bind(id)
    .all();

  return c.json({ volumes: volumes.results as unknown as Volume[] });
});

// 某书完整目录（书籍介绍页 + 目录页用）：篇章 join 卷元信息、附段落数
app.get("/api/books/:id/catalog", async (c) => {
  const id = c.req.param("id");
  const book = await getDb(c.env).prepare(
    `SELECT b.*, (SELECT COUNT(*) FROM volumes v WHERE v.book_id = b.id) AS imported_volumes
     FROM books b WHERE b.id = ?`,
  )
    .bind(id)
    .first();

  if (!book) {
    return errorResponse("NOT_FOUND", "Book not found", 404);
  }

  const chapters = await getDb(c.env).prepare(
    `SELECT ch.id, ch.name, ch.subtitle, ch.sort_order,
            v.volume_no, v.category, v.name AS volume_name,
            (SELECT COUNT(*) FROM passages p WHERE p.chapter_id = ch.id) AS passage_count
     FROM chapters ch
     JOIN volumes v ON v.id = ch.volume_id
     WHERE v.book_id = ?
     ORDER BY v.volume_no, ch.sort_order`,
  )
    .bind(id)
    .all();

  return c.json({
    book: book as unknown as Book,
    chapters: chapters.results as unknown as CatalogChapter[],
  } satisfies BookCatalog);
});

// 篇章详情（id 含斜杠）：附书/卷上下文、白话/注释、前后篇导航
app.get("/api/chapters/:id{.+}", async (c) => {
  const id = c.req.param("id");
  const chapter = await getDb(c.env).prepare(
    `SELECT ch.*, v.book_id, v.volume_no, v.category, v.name AS volume_name, b.name AS book_name
     FROM chapters ch
     JOIN volumes v ON v.id = ch.volume_id
     JOIN books b ON b.id = v.book_id
     WHERE ch.id = ?`,
  )
    .bind(id)
    .first();

  if (!chapter) {
    return errorResponse("NOT_FOUND", "Chapter not found", 404);
  }

  const passages = await getDb(c.env).prepare(
    "SELECT id, content, vernacular, annotation, glosses, order_idx, version FROM passages WHERE chapter_id = ? ORDER BY order_idx",
  )
    .bind(id)
    .all();

  // 前后篇：同书内按卷序、篇序排列，取当前篇的相邻两篇
  const siblings = await getDb(c.env).prepare(
    `SELECT ch.id, ch.name
     FROM chapters ch
     JOIN volumes v ON v.id = ch.volume_id
     WHERE v.book_id = ?
     ORDER BY v.volume_no, ch.sort_order`,
  )
    .bind((chapter as Record<string, unknown>).book_id as string)
    .all();

  const list = siblings.results as unknown as { id: string; name: string }[];
  const idx = list.findIndex((s) => s.id === id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  // 反序列化 glosses JSON → Gloss[]
  const passageList = (passages.results as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    content: row.content as string,
    vernacular: (row.vernacular as string) || null,
    annotation: (row.annotation as string) || null,
    glosses: row.glosses ? (JSON.parse(row.glosses as string) as Gloss[]) : null,
    order_idx: row.order_idx as number,
    version: row.version as number,
  }));

  return c.json({
    ...(chapter as unknown as ChapterDetail),
    passages: passageList,
    prev,
    next,
  } satisfies ChapterDetail);
});

// 实体详情（id 含斜杠，如 person/xiangyu）— P1
app.get("/api/entity/:id{.+}", async (c) => {
  const id = c.req.param("id");
  const entity = await getDb(c.env).prepare("SELECT * FROM entities WHERE id = ?")
    .bind(id)
    .first();

  if (!entity) {
    return errorResponse("NOT_FOUND", "Entity not found", 404);
  }

  const relations = await getDb(c.env).prepare(
    `SELECT r.*, e.name as target_name
     FROM relations r
     JOIN entities e ON r.target_id = e.id
     WHERE r.source_id = ?
     UNION ALL
     SELECT r.*, e.name as target_name
     FROM relations r
     JOIN entities e ON r.source_id = e.id
     WHERE r.target_id = ?`,
  )
    .bind(id, id)
    .all();

  return c.json({ entity, relations: relations.results });
});

// 实体原文出现 — P1
app.get("/api/entity/:id{.+}/mentions", async (c) => {
  const id = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  const countResult = await getDb(c.env).prepare(
    "SELECT COUNT(*) as total FROM entity_mentions WHERE entity_id = ?",
  )
    .bind(id)
    .first<{ total: number }>();

  const mentions = await getDb(c.env).prepare(
    "SELECT passage_id, context FROM entity_mentions WHERE entity_id = ? ORDER BY id LIMIT ? OFFSET ?",
  )
    .bind(id, limit, offset)
    .all();

  return c.json({
    entity_id: id,
    total: countResult?.total || 0,
    page,
    mentions: mentions.results,
  });
});

// R2 大对象代理（按前缀分发到不同桶）
// figures/, atlas/ → ASSETS_BUCKET（人物视觉资产 / 舆图 GeoJSON）
// maps/, images/ → 通用 R2（地图/朝代图）
const GENERIC_PUBLIC_PREFIXES = ["maps/", "images/"];
const ASSETS_BUCKET_PREFIXES = ["figures/", "atlas/"];
const ASSET_URL_BASE = "/api/asset/";

app.get("/api/asset/:key{.+}", async (c) => {
  const key = c.req.param("key");

  // 人物资产 / 舆图 GeoJSON → ASSETS_BUCKET
  if (ASSETS_BUCKET_PREFIXES.some((p) => key.startsWith(p))) {
    const bucket = (c.env as unknown as { ASSETS_BUCKET?: R2Bucket }).ASSETS_BUCKET;
    if (!bucket) {
      return errorResponse("SERVICE_UNAVAILABLE", "Assets storage not configured", 503);
    }
    const object = await bucket.get(key);
    if (!object) {
      return errorResponse("NOT_FOUND", "Asset not found", 404);
    }
    const isJson = key.endsWith(".geojson") || key.endsWith(".json");

    // 图片 + ?w=<宽> → 用 Cloudflare Images 绑定转 webp 并按宽缩放（原图多为 1024²、PNG 立绘达 1.5–2MB）。
    // Images 未启用/转换失败时优雅回退原图（复用已读 buffer，绝不 500）。命中按 URL(含 query) 走边缘缓存。
    const isImage = !isJson && /\.(jpe?g|png|webp|avif)$/i.test(key);
    const wRaw = parseInt(c.req.query("w") || "", 10);
    const width = Number.isFinite(wRaw) ? Math.min(Math.max(wRaw, 32), 1536) : null;
    if (isImage && width) {
      const buf = await object.arrayBuffer();
      try {
        // input 需 ReadableStream；用 Response(buf).body 得到流，同时保留 buf 作失败兜底
        const out = await c.env.IMAGES.input(new Response(buf).body!)
          .transform({ width })
          .output({ format: "image/webp", quality: 82 });
        return new Response(out.image(), {
          headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=604800" },
        });
      } catch {
        return new Response(buf, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
            "Cache-Control": "public, max-age=604800",
          },
        });
      }
    }

    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType ||
          (isJson ? "application/json; charset=utf-8" : "image/jpeg"),
        "Cache-Control": "public, max-age=604800",
      },
    });
  }

  // 通用公开资源 → 旧 R2（兼容）
  const r2 = (c.env as unknown as { R2?: R2Bucket }).R2;
  if (!r2) {
    return errorResponse("SERVICE_UNAVAILABLE", "R2 storage not configured", 503);
  }
  if (!GENERIC_PUBLIC_PREFIXES.some((p) => key.startsWith(p))) {
    return errorResponse("FORBIDDEN", "Not a public asset", 403);
  }
  const object = await r2.get(key);
  if (!object) {
    return errorResponse("NOT_FOUND", "Asset not found", 404);
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

// ─── 人物模块 API ───────────────────────────────────────────

function rowToFigure(row: Record<string, unknown>): Figure {
  return {
    id: String(row.id),
    name: String(row.name),
    aliases: row.aliases ? JSON.parse(String(row.aliases)) : [],
    birth_year: row.birth_year as number | null,
    death_year: row.death_year as number | null,
    dynasty: String(row.dynasty || ""),
    identity: String(row.identity || ""),
    bio_summary: String(row.bio_summary || ""),
    keyword_tags: row.keyword_tags ? JSON.parse(String(row.keyword_tags)) : [],
    avatar_icon: String(row.avatar_icon || ""),
    avatar_url: (row.avatar_url as string | null) || null,
    avatar: row.avatar_key ? `${ASSET_URL_BASE}${String(row.avatar_key)}` : null,
    gender: (row.gender as "male" | "female" | "unknown") || "unknown",
    star: Number(row.star ?? 1),
    src_book: String(row.src_book || ""),
    src_juan: row.src_juan as number | null,
    src_chapter: (row.src_chapter as string | null) || null,
  };
}

app.get("/api/figures", async (c) => {
  const db = getDb(c.env);
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 24)));
  const offset = (page - 1) * limit;
  const dynasty = c.req.query("dynasty");
  const identity = c.req.query("identity");
  const book = c.req.query("book"); // ← 新增：按 src_book 筛选（如 shiji）
  const q = c.req.query("q");
  const sort = c.req.query("sort") === "star" ? "star" : "era"; // era=历史时序（默认） | star=星级
  const minStar = Math.min(5, Math.max(0, Number(c.req.query("minStar") || 0)));

  // 人物为静态数据 → 整响应 KV 缓存（TTL 7 天），命中即 0 次库读。
  // 版本前缀 v2 = 去重+星级后；重灌/重排数据后 bump 版本即整体失效。
  // const listCacheKey = `figures:list:v3:${sort}:${page}:${limit}:${dynasty || ""}:${identity || ""}:${minStar}:${q || ""}`;
  const listCacheKey = `figures:list:v6:${sort}:${page}:${limit}:${book || ""}:${dynasty || ""}:${identity || ""}:${minStar}:${q || ""}`;
  const listCached = await kvGetSafe(c.env, listCacheKey);
  if (listCached) {
    c.header("X-Cache", "HIT");
    return c.json(JSON.parse(listCached));
  }

  const where: string[] = [];
  const args: unknown[] = [];
  if (dynasty) {
    where.push("dynasty = ?");
    args.push(dynasty);
  }
  if (identity) {
    where.push("identity = ?");
    args.push(identity);
  }
  if (book) {                       // ← 新增
    where.push("src_book = ?");
    args.push(book);
  }
  if (minStar > 0) {
    where.push("star >= ?");
    args.push(minStar);
  }
  if (q) {
    where.push("(name LIKE ? OR aliases LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRs = await db.prepare(`SELECT count(*) as c FROM figures ${whereSql}`).bind(...args).first<{ c: number }>();
  const total = totalRs?.c ?? 0;

  // dynasty 值有 300+ 变体（明初/东汉末/南朝梁...），按 LIKE 关键字归并到 18 个时间 bucket，
  // 与 birth_year 一起组成历史出现时间序：先朝代 bucket，bucket 内再按 birth_year。
  // bucket 顺序：五帝夏商周春秋战国秦汉 -> 三国晋十六国南北朝 -> 隋唐五代宋辽金（含西夏）元明清
  // ⚠️ CASE 按顺序匹配、首命中胜，必须把「更具体的多字/易混淆朝代」放在「单字朝代」之前，
  //    否则 LIKE '%夏%' 会误吞"西夏/十六国夏"，LIKE '%汉%' 误吞"成汉/南汉/北汉/蜀汉"，
  //    LIKE '%唐%' 误吞"后唐/南唐"，LIKE '%宋%' 误吞"刘宋/南朝宋"，LIKE '%梁%' 误吞"后梁/南梁"，等等。
  const dynastyBucket = `CASE
    WHEN dynasty LIKE '%五帝%' THEN 1
    /* ---- 上古三代 ---- */
    WHEN dynasty LIKE '%西周%' OR dynasty LIKE '%商末周初%' THEN 4
    WHEN dynasty LIKE '%东周%' OR dynasty LIKE '%春秋%' OR dynasty LIKE '%春秋战国%' THEN 5
    WHEN dynasty LIKE '%战国%' THEN 6
    WHEN dynasty = '夏' OR dynasty LIKE '%夏朝%' THEN 2
    WHEN dynasty = '商' OR dynasty LIKE '%商朝%' OR dynasty LIKE '%商周%' THEN 3
    WHEN dynasty = '周' THEN 4
    /* ---- 秦汉 ---- */
    WHEN dynasty LIKE '%楚汉%' OR dynasty LIKE '%秦末%' THEN 7
    WHEN dynasty = '秦' OR dynasty LIKE '%秦朝%' THEN 7
    WHEN dynasty LIKE '%新莽%' OR dynasty LIKE '%新汉%' THEN 8
    WHEN dynasty LIKE '%西汉%' OR dynasty LIKE '%东汉%' OR dynasty LIKE '%两汉%' THEN 8
    WHEN dynasty = '汉' THEN 8
    /* ---- 三国 ---- */
    WHEN dynasty LIKE '%三国%' OR dynasty LIKE '%三國%' OR dynasty LIKE '%曹魏%' OR dynasty LIKE '%蜀汉%'
      OR dynasty LIKE '%东吴%' OR dynasty LIKE '%孙吴%' OR dynasty LIKE '%三国吴%' OR dynasty LIKE '%三国蜀%'
      OR dynasty LIKE '%三国魏%' THEN 9
    /* ---- 晋 + 十六国 ---- */
    WHEN dynasty LIKE '%十六国%' OR dynasty LIKE '%前赵%' OR dynasty LIKE '%后赵%' OR dynasty LIKE '%汉赵%'
      OR dynasty LIKE '%前凉%' OR dynasty LIKE '%后凉%' OR dynasty LIKE '%南凉%' OR dynasty LIKE '%北凉%' OR dynasty LIKE '%西凉%'
      OR dynasty LIKE '%前燕%' OR dynasty LIKE '%后燕%' OR dynasty LIKE '%南燕%' OR dynasty LIKE '%北燕%'
      OR dynasty LIKE '%前秦%' OR dynasty LIKE '%后秦%' OR dynasty LIKE '%西秦%'
      OR dynasty LIKE '%成汉%' OR dynasty LIKE '%胡夏%' OR dynasty LIKE '%十六国夏%'
      OR dynasty LIKE '%代/%' OR dynasty = '代' THEN 10
    WHEN dynasty LIKE '%西晋%' OR dynasty LIKE '%东晋%' OR dynasty = '晋' THEN 10
    /* ---- 南北朝 ---- */
    WHEN dynasty LIKE '%南北朝%' OR dynasty LIKE '%南朝%' OR dynasty LIKE '%北朝%'
      OR dynasty LIKE '%北魏%' OR dynasty LIKE '%东魏%' OR dynasty LIKE '%西魏%'
      OR dynasty LIKE '%北齐%' OR dynasty LIKE '%北周%'
      OR dynasty LIKE '%南齐%' OR dynasty LIKE '%南梁%' OR dynasty LIKE '%南朝梁%' OR dynasty LIKE '%西梁%'
      OR dynasty LIKE '%南陈%' OR dynasty LIKE '%南朝陈%' OR dynasty LIKE '%南朝齐%'
      OR dynasty LIKE '%刘宋%' OR dynasty LIKE '%南朝宋%' OR dynasty LIKE '%南宋入%'   /* "南宋入北魏"等实为南朝宋 */
      OR dynasty LIKE '%梁周%' OR dynasty LIKE '%梁隋%'   /* "梁北周""梁隋"等残称 = 南朝梁 → 隋过渡 */
      THEN 11
    /* ---- 隋 ---- */
    WHEN dynasty LIKE '%隋%' THEN 12
    /* ---- 唐（含武周） ---- */
    WHEN dynasty LIKE '%武周%' THEN 13
    WHEN dynasty LIKE '%南唐%' THEN 14
    WHEN dynasty LIKE '%唐%' THEN 13
    /* ---- 五代十国 ---- */
    WHEN dynasty LIKE '%五代%' OR dynasty LIKE '%十国%'
      OR dynasty LIKE '%后梁%' OR dynasty LIKE '%后唐%' OR dynasty LIKE '%後唐%' OR dynasty LIKE '%后晋%'
      OR dynasty LIKE '%后汉%' OR dynasty LIKE '%后周%' OR dynasty LIKE '%后蜀%'
      OR dynasty LIKE '%前蜀%' OR dynasty LIKE '%南汉%' OR dynasty LIKE '%南吴%' OR dynasty LIKE '%吴越%'
      OR dynasty LIKE '%闽%' OR dynasty LIKE '%马楚%' OR dynasty LIKE '%南平%' OR dynasty LIKE '%北汉%' OR dynasty LIKE '%南楚%'
      THEN 14
    /* ---- 宋辽金西夏 ---- */
    WHEN dynasty LIKE '%西夏%' THEN 15
    WHEN dynasty LIKE '%辽%' OR dynasty LIKE '%契丹%' THEN 15
    WHEN dynasty LIKE '%金%' THEN 15
    WHEN dynasty LIKE '%北宋%' OR dynasty LIKE '%南宋%' THEN 15
    WHEN dynasty = '宋' THEN 15
    /* ---- 元明清 ---- */
    WHEN dynasty LIKE '%元%' OR dynasty LIKE '%蒙古%' OR dynasty LIKE '%蒙元%' THEN 16
    WHEN dynasty LIKE '%明%' THEN 17
    WHEN dynasty LIKE '%清%' THEN 18
    WHEN dynasty IS NULL OR dynasty = '' THEN 99
    ELSE 50
  END`;

  // 朝代锚点年：当 birth_year 为 NULL 时，用朝代起始年兜底，保证夏商周人物排在春秋之前。
  // ⚠️ 必须与 dynastyBucket 保持相同的匹配顺序和覆盖范围，多字/易混淆朝代放在单字朝代之前。
  const dynastyAnchor = `CASE
    WHEN dynasty LIKE '%五帝%' THEN -2600
    /* ---- 上古三代 ---- */
    WHEN dynasty LIKE '%西周%' OR dynasty LIKE '%商末周初%' THEN -1046
    WHEN dynasty LIKE '%东周%' OR dynasty LIKE '%春秋%' OR dynasty LIKE '%春秋战国%' THEN -770
    WHEN dynasty LIKE '%战国%' THEN -475
    WHEN dynasty = '夏' OR dynasty LIKE '%夏朝%' THEN -2070
    WHEN dynasty = '商' OR dynasty LIKE '%商朝%' OR dynasty LIKE '%商周%' THEN -1600
    WHEN dynasty = '周' THEN -1046
    /* ---- 秦汉 ---- */
    WHEN dynasty LIKE '%楚汉%' OR dynasty LIKE '%秦末%' THEN -206
    WHEN dynasty = '秦' OR dynasty LIKE '%秦朝%' THEN -221
    WHEN dynasty LIKE '%新莽%' OR dynasty LIKE '%新汉%' THEN 8
    WHEN dynasty LIKE '%西汉%' OR dynasty LIKE '%东汉%' OR dynasty LIKE '%两汉%' THEN -202
    WHEN dynasty = '汉' THEN -202
    /* ---- 三国 ---- */
    WHEN dynasty LIKE '%三国%' OR dynasty LIKE '%三國%' OR dynasty LIKE '%曹魏%' OR dynasty LIKE '%蜀汉%'
      OR dynasty LIKE '%东吴%' OR dynasty LIKE '%孙吴%' OR dynasty LIKE '%三国吴%' OR dynasty LIKE '%三国蜀%'
      OR dynasty LIKE '%三国魏%' THEN 220
    /* ---- 晋 + 十六国 ---- */
    WHEN dynasty LIKE '%十六国%' OR dynasty LIKE '%前赵%' OR dynasty LIKE '%后赵%' OR dynasty LIKE '%汉赵%'
      OR dynasty LIKE '%前凉%' OR dynasty LIKE '%后凉%' OR dynasty LIKE '%南凉%' OR dynasty LIKE '%北凉%' OR dynasty LIKE '%西凉%'
      OR dynasty LIKE '%前燕%' OR dynasty LIKE '%后燕%' OR dynasty LIKE '%南燕%' OR dynasty LIKE '%北燕%'
      OR dynasty LIKE '%前秦%' OR dynasty LIKE '%后秦%' OR dynasty LIKE '%西秦%'
      OR dynasty LIKE '%成汉%' OR dynasty LIKE '%胡夏%' OR dynasty LIKE '%十六国夏%'
      OR dynasty LIKE '%代/%' OR dynasty = '代' THEN 304
    WHEN dynasty LIKE '%西晋%' OR dynasty LIKE '%东晋%' OR dynasty = '晋' THEN 266
    /* ---- 南北朝 ---- */
    WHEN dynasty LIKE '%南北朝%' OR dynasty LIKE '%南朝%' OR dynasty LIKE '%北朝%'
      OR dynasty LIKE '%北魏%' OR dynasty LIKE '%东魏%' OR dynasty LIKE '%西魏%'
      OR dynasty LIKE '%北齐%' OR dynasty LIKE '%北周%'
      OR dynasty LIKE '%南齐%' OR dynasty LIKE '%南梁%' OR dynasty LIKE '%南朝梁%' OR dynasty LIKE '%西梁%'
      OR dynasty LIKE '%南陈%' OR dynasty LIKE '%南朝陈%' OR dynasty LIKE '%南朝齐%'
      OR dynasty LIKE '%刘宋%' OR dynasty LIKE '%南朝宋%' OR dynasty LIKE '%南宋入%'
      OR dynasty LIKE '%梁周%' OR dynasty LIKE '%梁隋%'
      THEN 420
    /* ---- 隋 ---- */
    WHEN dynasty LIKE '%隋%' THEN 581
    /* ---- 唐 ---- */
    WHEN dynasty LIKE '%武周%' THEN 690
    WHEN dynasty LIKE '%南唐%' THEN 937
    WHEN dynasty LIKE '%唐%' THEN 618
    /* ---- 五代十国 ---- */
    WHEN dynasty LIKE '%五代%' OR dynasty LIKE '%十国%'
      OR dynasty LIKE '%后梁%' OR dynasty LIKE '%后唐%' OR dynasty LIKE '%後唐%' OR dynasty LIKE '%后晋%'
      OR dynasty LIKE '%后汉%' OR dynasty LIKE '%后周%' OR dynasty LIKE '%后蜀%'
      OR dynasty LIKE '%前蜀%' OR dynasty LIKE '%南汉%' OR dynasty LIKE '%南吴%' OR dynasty LIKE '%吴越%'
      OR dynasty LIKE '%闽%' OR dynasty LIKE '%马楚%' OR dynasty LIKE '%南平%' OR dynasty LIKE '%北汉%' OR dynasty LIKE '%南楚%'
      THEN 907
    /* ---- 宋辽金西夏 ---- */
    WHEN dynasty LIKE '%西夏%' THEN 1038
    WHEN dynasty LIKE '%辽%' OR dynasty LIKE '%契丹%' THEN 916
    WHEN dynasty LIKE '%金%' THEN 1115
    WHEN dynasty LIKE '%北宋%' THEN 960
    WHEN dynasty LIKE '%南宋%' THEN 1127
    WHEN dynasty = '宋' THEN 960
    /* ---- 元明清 ---- */
    WHEN dynasty LIKE '%元%' OR dynasty LIKE '%蒙古%' OR dynasty LIKE '%蒙元%' THEN 1206
    WHEN dynasty LIKE '%明%' THEN 1368
    WHEN dynasty LIKE '%清%' THEN 1636
    ELSE 0
  END`;

  // star 排序：星级降序优先，同星级内仍按历史时序，保证可读；era 为默认历史时序。
  // 用 COALESCE(birth_year, dynastyAnchor) 兜底：有精确 birth_year 用精确值，否则用朝代起始年，
  // 避免夏商周(NULL)人物排到春秋(-551)之后。
  const orderSql =
    sort === "star"
      ? `star DESC, ${dynastyBucket} ASC, COALESCE(birth_year, ${dynastyAnchor}) ASC, name ASC`
      : `${dynastyBucket} ASC, COALESCE(birth_year, ${dynastyAnchor}) ASC, name ASC`;

  // 关联子查询取每人默认头像的 r2_key（有 R2 资产才非空），省去前端每卡单独拉 /assets（N+1）
  const listRs = await db.prepare(
    `SELECT id, name, aliases, birth_year, death_year, dynasty, identity, bio_summary, keyword_tags, avatar_icon, avatar_url, gender, star, src_book, src_juan, src_chapter,
       (SELECT af.r2_key FROM figure_assets fa
          JOIN asset_files af ON af.asset_id = fa.id AND af.asset_type = 'avatar'
         WHERE fa.figure_id = figures.id AND fa.status = 'active'
         ORDER BY fa.is_default DESC, (af.variant = 'default') DESC, af.sort_order ASC
         LIMIT 1) AS avatar_key
     FROM figures ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`
  ).bind(...args, limit, offset).all<Record<string, unknown>>();

  const items = listRs.results.map(rowToFigure);

  // 过滤器聚合是与分页/查询无关的全局静态量，独立缓存（TTL 7 天）：
  // 即便冷门 q 未命中整响应缓存，也不再每次对全表跑两次 GROUP BY。
  let filters: FigureListResponse["filters"];
  const filtersCached = await kvGetSafe(c.env, "figures:filters:v2");
  if (filtersCached) {
    filters = JSON.parse(filtersCached);
  } else {
    const dynRs = await db.prepare(
      "SELECT dynasty as value, count(*) as count FROM figures GROUP BY dynasty ORDER BY count DESC"
    ).all<{ value: string; count: number }>();
    const idenRs = await db.prepare(
      "SELECT identity as value, count(*) as count FROM figures GROUP BY identity ORDER BY count DESC"
    ).all<{ value: string; count: number }>();
    filters = {
      dynasties: dynRs.results.filter((r) => r.value),
      identities: idenRs.results.filter((r) => r.value),
    };
    kvPutSafe(c, "figures:filters:v2", JSON.stringify(filters));
  }

  const data: FigureListResponse = { total, page, limit, items, filters };
  kvPutSafe(c, listCacheKey, JSON.stringify(data));
  c.header("X-Cache", "MISS");
  return c.json(data);
});

// 关系图谱（取度数最高的 top N 节点 + 去重无向边）。注意：必须注册在 /:id 之前。
// ?top=N（默认 2000）限制节点数；?focus=id 确保指定节点必然包含；
// ?focus=id&depth=N 返回该节点的 N 跳自我子图（人物关系页专用，秒开）。
app.get("/api/figures/graph", async (c) => {
  const db = getDb(c.env);
  const top = Math.min(Math.max(parseInt(c.req.query("top") || "2000"), 100), 5000);
  const focusId = c.req.query("focus") || null;
  const depthParam = c.req.query("depth");
  const egoDepth =
    focusId && depthParam
      ? Math.min(Math.max(parseInt(depthParam) || 2, 1), 3)
      : 0;
  const EGO_CAP = 300; // 自我子图节点上限，避免枢纽人物爆图

  // KV 缓存；关系为静态数据 → 长 TTL（见下）。v3 = 补充高星人物关系后刷新缓存。
  const cacheKey = `graph:v3:top${top}${focusId ? `:${focusId}` : ""}${egoDepth ? `:d${egoDepth}` : ""}`;
  try {
    const cached = await c.env.KV.get(cacheKey);
    if (cached) {
      c.header("X-Cache", "HIT");
      return c.json(JSON.parse(cached));
    }
  } catch { /* KV unavailable in local dev, fall through */ }

  // 先算度数（仅从关系表，不拉全量人物）
  const linkRs = await db.prepare(
    "SELECT figure_a, figure_b, relation_type FROM figure_relations",
  ).all<Record<string, unknown>>();

  const degree: Record<string, number> = {};
  const rawLinks: { a: string; b: string; type: string }[] = [];
  const seen = new Set<string>();
  for (const r of linkRs.results) {
    const a = String(r.figure_a), b = String(r.figure_b);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rawLinks.push({ a, b, type: String(r.relation_type || "peer") });
    degree[a] = (degree[a] || 0) + 1;
    degree[b] = (degree[b] || 0) + 1;
  }

  // 选节点集：自我子图（BFS）或全局 top-N
  let topIds: Set<string>;
  if (egoDepth && focusId) {
    const adj = new Map<string, Set<string>>();
    for (const l of rawLinks) {
      (adj.get(l.a) ?? adj.set(l.a, new Set()).get(l.a)!).add(l.b);
      (adj.get(l.b) ?? adj.set(l.b, new Set()).get(l.b)!).add(l.a);
    }
    const ego = new Set<string>([focusId]);
    let frontier = [focusId];
    for (let d = 0; d < egoDepth && ego.size < EGO_CAP; d++) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        for (const nb of adj.get(nodeId) ?? []) {
          if (!ego.has(nb)) {
            ego.add(nb);
            next.push(nb);
            if (ego.size >= EGO_CAP) break;
          }
        }
        if (ego.size >= EGO_CAP) break;
      }
      frontier = next;
    }
    topIds = ego;
  } else {
    const sorted = Object.entries(degree).sort((x, y) => y[1] - x[1]);
    topIds = new Set(sorted.slice(0, top).map(([id]) => id));
    if (focusId) topIds.add(focusId);
  }

  // 只保留两端都在 topIds 里的边
  const links = rawLinks
    .filter((l) => topIds.has(l.a) && topIds.has(l.b))
    .map((l) => ({ source: l.a, target: l.b, type: l.type }));

  // 拉人物信息（只取 topIds）
  const idList = [...topIds];
  // libSQL 不支持 IN (?) 绑定数组，分批或用临时字符串
  const placeholders = idList.map(() => "?").join(",");
  const nodeRs = await db.prepare(
    `SELECT id, name, identity, dynasty, gender, star FROM figures WHERE id IN (${placeholders})`,
  ).bind(...idList).all<Record<string, unknown>>();

  const nodes = nodeRs.results.map((n) => ({
    id: String(n.id),
    name: String(n.name),
    identity: String(n.identity || ""),
    dynasty: String(n.dynasty || ""),
    gender: String(n.gender || "unknown"),
    star: Number(n.star ?? 1),
    degree: degree[String(n.id)] || 0,
  }));

  const result = { nodes, links, total: Object.keys(degree).length };
  // 关系图为静态数据（52k 行全表扫/次），拉长到 7 天：每个 key 一周只算一次，
  // 是此前 551M 月读的主凶之一（原 TTL 仅 120/300s，ego 焦点参数多导致频繁 miss）。
  const ttl = 604800;
  try {
    await c.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: ttl });
  } catch { /* KV unavailable in local dev, skip write */ }
  c.header("X-Cache", "MISS");
  return c.json(result);
});

app.get("/api/figures/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  const figureRow = await db.prepare("SELECT id, name, aliases, birth_year, death_year, dynasty, identity, bio_summary, keyword_tags, avatar_icon, avatar_url, gender, star, src_book, src_juan, src_chapter FROM figures WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!figureRow) {
    return errorResponse("NOT_FOUND", "Figure not found", 404);
  }
  const figure = rowToFigure(figureRow);

  const passageRs = await db.prepare(`
    SELECT fp.passage_id, fp.event_name, fp.event_year, fp.location, fp.role, fp.sort_order,
           p.chapter_id, p.content, p.order_idx,
           ch.name as chapter_name, ch.volume_id,
           v.volume_no, v.book_id,
           b.name as book_name
    FROM figure_passages fp
    JOIN passages p ON fp.passage_id = p.id
    JOIN chapters ch ON p.chapter_id = ch.id
    JOIN volumes v ON ch.volume_id = v.id
    JOIN books b ON v.book_id = b.id
    WHERE fp.figure_id = ?
    ORDER BY fp.event_year IS NULL, fp.event_year ASC, fp.sort_order ASC, p.order_idx ASC
  `).bind(id).all<Record<string, unknown>>();

  const passages: FigurePassage[] = passageRs.results.map((r) => ({
    passage_id: String(r.passage_id),
    chapter_id: String(r.chapter_id),
    chapter_name: String(r.chapter_name || ""),
    book_id: String(r.book_id || ""),
    book_name: String(r.book_name || ""),
    volume_no: Number(r.volume_no || 0),
    title: String(r.event_name || r.chapter_name || ""),
    content: String(r.content || ""),
    year: r.event_year as number | null,
    location: (r.location as string | null) || null,
    order_idx: Number(r.sort_order || r.order_idx || 0),
  }));

  const detail: FigureDetail = { ...figure, passages };
  return c.json(detail);
});

// 小程序码：仅五星角色，供 PC 端扫码跳转小程序对应角色详情页
// 1. 校验 figures.star=5 → 2. KV 命中返回缓存 URL → 3. fetch 小程序云函数 HTTP 触发器生成 → 4. 缓存到 KV
app.get("/api/figures/:id/qrcode", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  // 校验人物存在且为五星
  const row = await db.prepare("SELECT id, star FROM figures WHERE id = ?").bind(id).first<{ id: string; star: number }>();
  if (!row) return errorResponse("NOT_FOUND", "Figure not found", 404);
  if (!row.star || row.star < 5) return errorResponse("NOT_FIVE_STAR", "仅五星角色支持小程序码", 403);

  const fnUrl = c.env.MINI_QRCODE_FN_URL;
  if (!fnUrl) return errorResponse("QRCODE_NOT_CONFIGURED", "未配置小程序码云函数 URL", 500);

  // KV 缓存命中（临时 URL 签名约 2h 过期，TTL 30min 提前刷新，避免签名过期 403）
  // v3 前缀：强制失效旧缓存
  const cacheKey = `qrcode:v3:${id}`;
  const cached = await kvGetSafe(c.env, cacheKey);
  if (cached) {
    return c.json({ url: cached, cached: true });
  }

  // 调小程序云函数 HTTP 触发器
  const reqUrl = `${fnUrl}${fnUrl.includes("?") ? "&" : "?"}figureId=${encodeURIComponent(id)}`;
  let resp: Response;
  try {
    resp = await fetch(reqUrl, { method: "GET", headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return errorResponse("QRCODE_FETCH_FAILED", `调用云函数失败: ${(e as Error).message}`, 502);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("[qrcode] cloud function HTTP error:", resp.status, errText.slice(0, 500));
    return errorResponse("QRCODE_FN_ERROR", `云函数返回 ${resp.status}`, 502);
  }

  // 兼容两种返回格式：
  // 1. HTTP 网关格式: { statusCode: 200, body: '{"code":0,...}' }
  // 2. 直接 JSON: { code: 0, data: { url: "..." } }
  const rawText = await resp.text();
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[qrcode] cloud function returned non-JSON:", rawText.slice(0, 500));
    return errorResponse("QRCODE_GENERATE_FAILED", "云函数返回非 JSON", 502);
  }

  // 如果是 HTTP 网关包装格式，解析 body
  let data = parsed;
  if (parsed && typeof parsed.body === "string") {
    try {
      data = JSON.parse(parsed.body);
    } catch {
      console.error("[qrcode] failed to parse gateway body:", parsed.body.slice(0, 500));
      return errorResponse("QRCODE_GENERATE_FAILED", "云函数返回格式异常", 502);
    }
  }

  if (data.code !== 0 || !data.data || !data.data.url) {
    console.error("[qrcode] cloud function returned error:", JSON.stringify(data).slice(0, 500));
    const errMsg = data.data?.error || data.message || "云函数未返回有效 URL";
    return errorResponse("QRCODE_GENERATE_FAILED", errMsg, 502);
  }
  const url = data.data.url;
  // 缓存 30 分钟（临时签名 URL 约 2h 过期，提前刷新避免 403）
  kvPutSafe(c, cacheKey, url, 1800);
  return c.json({ url, cached: false });
});

app.get("/api/figures/:id/relations", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  const relRs = await db.prepare(`
    SELECT fr.figure_a, fr.figure_b, fr.relation_type, fr.relation_label, fr.description,
           CASE WHEN fr.figure_a = ? THEN fb.id ELSE fa.id END as target_id,
           CASE WHEN fr.figure_a = ? THEN fb.name ELSE fa.name END as target_name,
           CASE WHEN fr.figure_a = ? THEN fb.identity ELSE fa.identity END as target_identity,
           CASE WHEN fr.figure_a = ? THEN fb.dynasty ELSE fa.dynasty END as target_dynasty,
           (SELECT count(*) FROM figure_passages fp WHERE fp.figure_id = fr.figure_a AND fp.passage_id IN
             (SELECT passage_id FROM figure_passages WHERE figure_id =
               CASE WHEN fr.figure_a = ? THEN fb.id ELSE fa.id END)) as passage_count
    FROM figure_relations fr
    JOIN figures fa ON fr.figure_a = fa.id
    JOIN figures fb ON fr.figure_b = fb.id
    WHERE fr.figure_a = ? OR fr.figure_b = ?
    ORDER BY fr.relation_type, target_name
  `).bind(id, id, id, id, id, id, id).all<Record<string, unknown>>();

  // 按 target 去重，且优先保留「出边」（figure_a=本人）——其 relation_label 是从本人视角写的，方向正确；
  // 「入边」（他传提到本人）label 是对方视角，方向相反，故只保留人物本身、不显示会误导的 label。
  const byTarget = new Map<string, FigureRelation>();
  for (const r of relRs.results) {
    const tid = String(r.target_id);
    if (!tid || tid === id) continue;
    const outgoing = String(r.figure_a) === id;
    const rec: FigureRelation = {
      target_id: tid,
      target_name: String(r.target_name),
      target_identity: String(r.target_identity || ""),
      target_dynasty: String(r.target_dynasty || ""),
      relation_type: String(r.relation_type || "peer"),
      relation_label: outgoing ? String(r.relation_label || "") : "",
      description: (r.description as string | null) || null,
      passage_count: Number(r.passage_count || 0),
    };
    const prev = byTarget.get(tid);
    // 出边优先覆盖入边
    if (!prev || (outgoing && !prev.relation_label)) byTarget.set(tid, rec);
  }

  return c.json({ relations: [...byTarget.values()] });
});

app.get("/api/avatar/:id", async (c) => {
  const bucket = (c.env as unknown as { AVATAR_BUCKET?: R2Bucket }).AVATAR_BUCKET;
  if (!bucket) {
    return errorResponse("SERVICE_UNAVAILABLE", "Avatar storage not configured", 503);
  }
  const id = c.req.param("id");
  const key = `${id}.jpg`;
  const object = await bucket.get(key);
  if (!object) {
    return errorResponse("NOT_FOUND", "Avatar not found", 404);
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=604800",
    },
  });
});

// AI 头像生成：根据 gender + identity + dynasty 生成 prompt，调用 TRAE text_to_image API
app.post("/api/avatar/:id/generate", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  const figureRow = await db.prepare("SELECT id, name, identity, dynasty, bio_summary, gender FROM figures WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!figureRow) {
    return errorResponse("NOT_FOUND", "Figure not found", 404);
  }

  const name = String(figureRow.name);
  const identity = String(figureRow.identity || "");
  const dynasty = String(figureRow.dynasty || "");
  const bio = String(figureRow.bio_summary || "");
  const gender = String(figureRow.gender || "unknown");

  // 根据 gender 构建人物描述
  const genderDesc = gender === "female" ? "ancient Chinese woman" : gender === "male" ? "ancient Chinese man" : "ancient Chinese historical figure";

  // 根据身份构建角色特征
  const identityDesc: Record<string, string> = {
    "帝王": "emperor wearing imperial dragon robe and crown, regal bearing",
    "将相": "general or minister in formal court attire, armored or official robe",
    "文人": "scholar in flowing robes, holding a scroll or brush, refined demeanor",
    "后妃": "noble consort in elegant palace dress, phoenix hairpin, graceful",
    "刺客": "assassin in dark robes, sharp eyes, concealed dagger",
    "游侠": "wandering swordsman in practical travel clothes, spirited",
    "谋士": "strategist in scholarly robes, holding a fan, contemplative gaze",
    "异族": "tribal leader in distinctive ethnic garments, bold features",
  };
  const roleDesc = identityDesc[identity] || "historical figure in traditional Chinese attire";

  const prompt = `Portrait of ${name}, an ${genderDesc} from ${dynasty} dynasty China. ${roleDesc}. ${bio.slice(0, 200) || "Historical figure"}. Ink wash painting style, traditional Chinese art, detailed face, atmospheric lighting, muted earth tones, 1024x1024 portrait orientation.`;

  // 调用 TRAE text_to_image API
  const apiUrl = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image";
  const params = new URLSearchParams({
    prompt,
    image_size: "square_hd",
  });

  const imgResponse = await fetch(`${apiUrl}?${params.toString()}`);
  if (!imgResponse.ok) {
    return errorResponse("IMAGE_GEN_FAILED", `Image generation failed: ${imgResponse.status}`, 502);
  }

  const imageBuffer = await imgResponse.arrayBuffer();

  // 存储到 R2
  const bucket = (c.env as unknown as { AVATAR_BUCKET?: R2Bucket }).AVATAR_BUCKET;
  if (bucket) {
    await bucket.put(`${id}.jpg`, imageBuffer, {
      httpMetadata: { contentType: "image/jpeg" },
    });
  }

  // 更新数据库 avatar_url
  await db.prepare("UPDATE figures SET avatar_url = ? WHERE id = ?").bind(`/api/avatar/${id}`, id).run();

  return c.json({ ok: true, avatar_url: `/api/avatar/${id}` });
});

// ─── 人物视觉资产 API ─────────────────────────────────────────

function safeParseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rowToAssetFile(row: Record<string, unknown>): AssetFile {
  const r2Key = String(row.r2_key);
  return {
    id: String(row.id),
    asset_id: String(row.asset_id),
    asset_type: String(row.asset_type) as AssetType,
    variant: String(row.variant || "default"),
    r2_key: r2Key,
    url: `${ASSET_URL_BASE}${r2Key}`,
    mime_type: String(row.mime_type || "image/jpeg"),
    width: row.width as number | null,
    height: row.height as number | null,
    size_bytes: row.size_bytes as number | null,
    sort_order: Number(row.sort_order || 0),
    metadata: safeParseJSON<AssetFileMetadata | null>(row.metadata as string | null, null),
    created_at: Number(row.created_at || 0),
  };
}

function rowToFigureAsset(row: Record<string, unknown>, files: AssetFile[] = []): FigureAsset {
  return {
    id: String(row.id),
    figure_id: String(row.figure_id),
    style_id: String(row.style_id),
    style_name: row.style_name ? String(row.style_name) : undefined,
    is_default: !!row.is_default,
    creator: (row.creator as string | null) || null,
    status: (row.status as FigureAsset["status"]) || "draft",
    metadata: safeParseJSON<Record<string, unknown> | null>(row.metadata as string | null, null),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
    files,
  };
}

// 获取可用美术风格列表
app.get("/api/art-styles", async (c) => {
  const db = getDb(c.env);
  const rs = await db.prepare(
    "SELECT id, name, description, sort_order, is_active FROM art_styles WHERE is_active = 1 ORDER BY sort_order ASC",
  ).all<Record<string, unknown>>();

  const styles: ArtStyle[] = rs.results.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string | null) || null,
    sort_order: Number(r.sort_order || 0),
    is_active: !!r.is_active,
  }));
  return c.json({ styles });
});

// 获取人物所有风格的资产
app.get("/api/figures/:id/assets", async (c) => {
  const db = getDb(c.env);
  const figureId = c.req.param("id");

  // 验证人物存在
  const figureExists = await db.prepare("SELECT id FROM figures WHERE id = ?").bind(figureId).first();
  if (!figureExists) {
    return errorResponse("NOT_FOUND", "Figure not found", 404);
  }

  // 取所有资产组 + style 名
  const assetRs = await db.prepare(`
    SELECT fa.*, s.name as style_name
    FROM figure_assets fa
    JOIN art_styles s ON s.id = fa.style_id
    WHERE fa.figure_id = ? AND fa.status = 'active'
    ORDER BY fa.is_default DESC, s.sort_order ASC
  `).bind(figureId).all<Record<string, unknown>>();

  if (assetRs.results.length === 0) {
    return c.json({ figure_id: figureId, default_style: null, assets: {} });
  }

  // 批量取每个资产组的文件
  const assetIds = assetRs.results.map((r) => String(r.id));
  const placeholders = assetIds.map(() => "?").join(",");
  const filesRs = await db.prepare(
    `SELECT * FROM asset_files WHERE asset_id IN (${placeholders}) ORDER BY asset_type, sort_order ASC, variant ASC`,
  ).bind(...assetIds).all<Record<string, unknown>>();

  // 按 asset_id 分组文件
  const filesByAsset = new Map<string, AssetFile[]>();
  for (const fr of filesRs.results) {
    const aid = String(fr.asset_id);
    const list = filesByAsset.get(aid) ?? [];
    list.push(rowToAssetFile(fr));
    filesByAsset.set(aid, list);
  }

  // 组装
  const assets: Record<string, FigureAsset> = {};
  let defaultStyle: string | null = null;
  for (const ar of assetRs.results) {
    const aid = String(ar.id);
    const sid = String(ar.style_id);
    const asset = rowToFigureAsset(ar, filesByAsset.get(aid) || []);
    assets[sid] = asset;
    if (asset.is_default && !defaultStyle) defaultStyle = sid;
  }

  return c.json({ figure_id: figureId, default_style: defaultStyle, assets });
});

// 获取人物某风格的资产（支持 ?type=avatar 筛选）
app.get("/api/figures/:id/assets/:style", async (c) => {
  const db = getDb(c.env);
  const figureId = c.req.param("id");
  const styleId = c.req.param("style");
  const typeFilter = c.req.query("type") as AssetType | undefined;

  const assetRow = await db.prepare(`
    SELECT fa.*, s.name as style_name
    FROM figure_assets fa
    JOIN art_styles s ON s.id = fa.style_id
    WHERE fa.figure_id = ? AND fa.style_id = ?
  `).bind(figureId, styleId).first<Record<string, unknown>>();

  if (!assetRow) {
    return errorResponse("NOT_FOUND", "Asset group not found", 404);
  }

  let sql = "SELECT * FROM asset_files WHERE asset_id = ?";
  const args: unknown[] = [String(assetRow.id)];
  if (typeFilter) {
    sql += " AND asset_type = ?";
    args.push(typeFilter);
  }
  sql += " ORDER BY asset_type, sort_order ASC, variant ASC";

  const filesRs = await db.prepare(sql).bind(...args).all<Record<string, unknown>>();
  const files = filesRs.results.map(rowToAssetFile);

  const asset = rowToFigureAsset(assetRow, files);
  return c.json(asset);
});

// ─── 管理员：上传人物视觉资产到 R2 + 注册 DB ─────────────────
// 开发/预览环境自动放行；生产环境需 X-Admin-Key 头匹配 ADMIN_KEY secret
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
function defaultFileKey(t: AssetType, variant: string): string {
  switch (t) {
    case "portrait-bust": return `bust-${variant}`;
    case "portrait-full": return `full-${variant}`;
    default: return variant;
  }
}
const ALLOWED_UPLOAD_TYPES: AssetType[] = ["avatar", "portrait-bust", "portrait-full", "background", "cg", "chibi", "expression", "extra"];
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

app.post("/api/admin/assets/upload", async (c) => {
  // 1. 鉴权：dev 环境（localhost / *.workers.dev 预览）直接放行；生产要求 ADMIN_KEY
  const { ADMIN_KEY, ENVIRONMENT } = (c.env as unknown as {
    ADMIN_KEY?: string;
    ENVIRONMENT?: string;
  });
  const host = c.req.header("host") || "";
  const isDev =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".workers.dev") ||
    ENVIRONMENT === "development" ||
    ENVIRONMENT === "preview";
  if (!isDev) {
    const key = c.req.header("X-Admin-Key");
    if (!ADMIN_KEY || key !== ADMIN_KEY) {
      return errorResponse("UNAUTHORIZED", "Admin key required", 401);
    }
  }

  // 2. 解析 multipart/form-data
  let form: ReturnType<typeof c.req.parseBody> extends Promise<infer R> ? R : never;
  try {
    form = (await c.req.parseBody()) as any;
  } catch (e) {
    return errorResponse("BAD_REQUEST", "Invalid multipart body", 400);
  }
  const figureId = String((form as any).figureId || "").trim();
  const styleId = String((form as any).styleId || "classical").trim() || "classical";
  const type = String((form as any).type || "").trim() as AssetType;
  const variant = String((form as any).variant || "default").trim() || "default";
  const file = (form as any).file;

  if (!figureId) return errorResponse("BAD_REQUEST", "Missing figureId", 400);
  if (!ALLOWED_UPLOAD_TYPES.includes(type)) {
    return errorResponse("BAD_REQUEST", `Invalid type: ${type}`, 400);
  }
  if (!file || !(file instanceof File) || file.size === 0) {
    return errorResponse("BAD_REQUEST", "Missing file", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse("PAYLOAD_TOO_LARGE", "File too large (>15MB)", 413);
  }

  // 3. 校验扩展名
  const origName = (file as File).name || "";
  const extMatch = origName.match(/\.([a-zA-Z0-9]+)$/);
  const extFromName = extMatch ? extMatch[1].toLowerCase() : "";
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extFromMime = mimeToExt[(file as File).type] || "";
  const ext = ALLOWED_EXT.has(extFromName) ? extFromName : extFromMime;
  if (!ext) {
    return errorResponse("BAD_REQUEST", `Unsupported file type: ${(file as File).type}`, 400);
  }

  // 4. 拼 R2 key
  const folder = typeToFolder(type);
  const fileKey = defaultFileKey(type, variant);
  const r2Key = `figures/${figureId}/${styleId}/${folder}/${fileKey}.${ext}`;

  // 5. 上传 R2
  const bucket = (c.env as unknown as { ASSETS_BUCKET?: R2Bucket }).ASSETS_BUCKET;
  if (!bucket) {
    return errorResponse("SERVICE_UNAVAILABLE", "Assets storage not configured", 503);
  }
  const arrayBuf = await (file as File).arrayBuffer();
  const contentType = (file as File).type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  await bucket.put(r2Key, arrayBuf, {
    httpMetadata: { contentType },
  });

  // 6. 获取图片宽高（仅对图片类型，用简单解析）
  let width: number | null = null;
  let height: number | null = null;
  try {
    // 用最小的 PNG/JPEG 头解析，不引入额外依赖
    const dims = parseImageDims(new Uint8Array(arrayBuf), ext);
    if (dims) { width = dims.w; height = dims.h; }
  } catch { /* ignore */ }

  const db = getDb(c.env);

  // 7. 确保 figure 存在
  const figRow = await db.prepare("SELECT id FROM figures WHERE id = ?").bind(figureId).first();
  if (!figRow) {
    return errorResponse("NOT_FOUND", `Figure '${figureId}' not found in DB`, 404);
  }

  // 8. upsert figure_assets
  const assetId = `${figureId}:${styleId}`;
  const now = Math.floor(Date.now() / 1000);
  const existingAsset = await db.prepare("SELECT id FROM figure_assets WHERE id = ?").bind(assetId).first();
  if (!existingAsset) {
    await db.prepare(`
      INSERT INTO figure_assets (id, figure_id, style_id, is_default, creator, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'admin', 'active', NULL, ?, ?)
    `).bind(assetId, figureId, styleId, now, now).run();
  } else {
    await db.prepare("UPDATE figure_assets SET status='active', updated_at=? WHERE id=?").bind(now, assetId).run();
  }

  // 9. upsert asset_files
  const fileId = `${assetId}:${type}:${variant}`;
  const existingFile = await db.prepare("SELECT id FROM asset_files WHERE id = ?").bind(fileId).first();
  if (existingFile) {
    await db.prepare(`
      UPDATE asset_files
      SET r2_key=?, mime_type=?, width=?, height=?, size_bytes=?
      WHERE id=?
    `).bind(r2Key, contentType, width, height, (file as File).size, fileId).run();
  } else {
    await db.prepare(`
      INSERT INTO asset_files (id, asset_id, asset_type, variant, r2_key, mime_type, width, height, size_bytes, sort_order, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).bind(fileId, assetId, type, variant, r2Key, contentType, width, height, (file as File).size, now).run();
  }

  // 10. 如果是 avatar 类型，同步更新 figures.avatar_url
  if (type === "avatar") {
    await db.prepare("UPDATE figures SET avatar_url = ? WHERE id = ?").bind(`/api/asset/${r2Key}`, figureId).run();
  }

  return c.json({
    ok: true,
    file: {
      id: fileId,
      asset_id: assetId,
      asset_type: type,
      variant,
      r2_key: r2Key,
      url: `${ASSET_URL_BASE}${r2Key}`,
      mime_type: contentType,
      width,
      height,
      size_bytes: (file as File).size,
    },
  });
});

// ── 最小 PNG/JPEG/WebP 尺寸解析（无额外依赖） ──
function parseImageDims(buf: Uint8Array, ext: string): { w: number; h: number } | null {
  if (ext === "png") {
    // PNG: 8-byte signature + IHDR chunk at offset 16, width(4) height(4) big-endian
    if (buf.length < 24) return null;
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
    const w = (buf[16] << 24) >>> 0 | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    const h = (buf[20] << 24) >>> 0 | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    return { w, h };
  }
  if (ext === "webp") {
    // WebP: RIFF....WEBP + VP8/VP8L/VP8X chunk
    // RIFF header: "RIFF" (4) + size (4) + "WEBP" (4) = 12 bytes
    if (buf.length < 30) return null;
    // Check RIFF....WEBP signature
    if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46) return null;
    if (buf[8] !== 0x57 || buf[9] !== 0x45 || buf[10] !== 0x42 || buf[11] !== 0x50) return null;
    // Scan chunks starting at offset 12
    let off = 12;
    while (off + 8 <= buf.length) {
      const fourCC = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]);
      const chunkSize = buf[off+4] | (buf[off+5] << 8) | (buf[off+6] << 16) | (buf[off+7] << 24);
      const dataOff = off + 8;
      if (fourCC === "VP8 " && dataOff + 10 <= buf.length) {
        // Lossy VP8: frame tag at +3 (3 bytes skip), then width (14 bits LE) at +6, height at +8
        const w = buf[dataOff+6] | (buf[dataOff+7] << 8) & 0x3FFF;
        const h = buf[dataOff+8] | (buf[dataOff+9] << 8) & 0x3FFF;
        return { w, h };
      }
      if (fourCC === "VP8L" && dataOff + 5 <= buf.length) {
        // Lossless VP8L: 1 byte signature (0x2F), then 14 bits width-1, 14 bits height-1 (LE, packed 28 bits)
        if (buf[dataOff] !== 0x2F) { off += 8 + chunkSize + (chunkSize & 1); continue; }
        const b0 = buf[dataOff+1], b1 = buf[dataOff+2], b2 = buf[dataOff+3], b3 = buf[dataOff+4];
        const w = 1 + (b0 | ((b1 & 0x3F) << 8));
        const h = 1 + (((b1 >> 6) | (b2 << 2) | ((b3 & 0xF) << 10)));
        return { w, h };
      }
      if (fourCC === "VP8X" && dataOff + 10 <= buf.length) {
        // Extended VP8X: width-1 (24 bits LE) at +4, height-1 at +7
        const w = 1 + (buf[dataOff+4] | (buf[dataOff+5] << 8) | (buf[dataOff+6] << 16));
        const h = 1 + (buf[dataOff+7] | (buf[dataOff+8] << 8) | (buf[dataOff+9] << 16));
        return { w, h };
      }
      off += 8 + chunkSize + (chunkSize & 1); // chunks are padded to even size
    }
    return null;
  }
  if (ext === "jpg" || ext === "jpeg") {
    // 遍历 JPEG markers 找 SOFn
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      let mrk = buf[i + 1];
      // 填充字节
      while (mrk === 0xFF && i + 1 < buf.length) { i++; mrk = buf[i + 1]; }
      // SOF0/1/2/3/5/6/7/9/A/B/D/E/F (0xC0-0xCF except C4/C8/CC)
      const isSOF =
        mrk >= 0xC0 && mrk <= 0xCF && mrk !== 0xC4 && mrk !== 0xC8 && mrk !== 0xCC;
      if (isSOF) {
        const h = (buf[i + 5] << 8) | buf[i + 6];
        const w = (buf[i + 7] << 8) | buf[i + 8];
        return { w, h };
      }
      const segLen = (buf[i + 2] << 8) | buf[i + 3];
      if (segLen < 2) return null;
      i += 2 + segLen;
    }
  }
  return null;
}

// ─── 舆图模块 API（见 docs/PRD_ATLAS.md §5） ─────────────────

const ATLAS_ATTRIBUTION =
  "疆域为示意改绘，据 historical-basemaps (GPL-3.0) / CHGIS 参考重制，界线不作依据";

// KV 缓存版本：改动种子数据或响应结构后 +1，线上即自然失效旧缓存（无需手动清 KV）
const ATLAS_CACHE_VER = "v3";

function rowToSnapshotMeta(r: Record<string, unknown>): AtlasSnapshotMeta {
  return {
    slug: String(r.slug),
    label: String(r.label),
    group: String(r.group_label || ""),
    year: Number(r.year),
    year_label: String(r.year_label || ""),
    blurb: String(r.blurb || ""),
    books: r.books ? JSON.parse(String(r.books)) : [],
    sort_order: Number(r.sort_order ?? 0),
  };
}

// 帧索引（KV 缓存 7 天）
app.get("/api/atlas/snapshots", async (c) => {
  const cached = await kvGetSafe(c.env, `atlas:${ATLAS_CACHE_VER}:index`);
  if (cached) return c.json(JSON.parse(cached));

  const rs = await getDb(c.env)
    .prepare("SELECT * FROM atlas_snapshots ORDER BY sort_order")
    .all<Record<string, unknown>>();
  const data: AtlasIndexResponse = {
    attribution: ATLAS_ATTRIBUTION,
    frames: rs.results.map(rowToSnapshotMeta),
  };

  kvPutSafe(c, `atlas:${ATLAS_CACHE_VER}:index`, JSON.stringify(data));
  return c.json(data);
});

// 单帧详情：meta + 都城 + 人物（联动 figures）+ 同期史册人物（自动窗口）
app.get("/api/atlas/snapshots/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `atlas:${ATLAS_CACHE_VER}:snap:${slug}`;
  const cached = await kvGetSafe(c.env, cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  const db = getDb(c.env);
  const metaRow = await db
    .prepare("SELECT * FROM atlas_snapshots WHERE slug = ?")
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!metaRow) {
    return errorResponse("NOT_FOUND", "Snapshot not found", 404);
  }
  const meta = rowToSnapshotMeta(metaRow);

  const markerRs = await db
    .prepare(
      `SELECT m.kind, m.name, m.lng, m.lat, m.regime, m.figure_id, m.place_name, m.note, m.sort_order,
              f.identity, f.avatar_icon, f.birth_year, f.death_year
       FROM atlas_markers m
       LEFT JOIN figures f ON f.id = m.figure_id
       WHERE m.snapshot_id = ?
       ORDER BY m.kind, m.sort_order`,
    )
    .bind(slug)
    .all<Record<string, unknown>>();

  const capitals: AtlasCapitalMarker[] = [];
  const figures: AtlasFigureMarker[] = [];
  for (const r of markerRs.results) {
    if (r.kind === "capital") {
      capitals.push({
        name: String(r.name),
        lng: Number(r.lng),
        lat: Number(r.lat),
        regime: String(r.regime || ""),
      });
    } else {
      figures.push({
        name: String(r.name),
        lng: Number(r.lng),
        lat: Number(r.lat),
        place_name: (r.place_name as string) || null,
        note: (r.note as string) || null,
        figure_id: (r.figure_id as string) || null,
        identity: (r.identity as string) || null,
        avatar_icon: (r.avatar_icon as string) || null,
        birth_year: (r.birth_year as number) ?? null,
        death_year: (r.death_year as number) ?? null,
      });
    }
  }

  // 同期史册人物：有效生卒（null 按 60 年寿命补）在断面年在世。
  // 出生须 ≤ 断面年（不纳入尚未出生者）；卒年给 8 年容差（含刚谢世的当代人物）。
  // 寿命护栏排除源数据符号错误（如元代人物 birth 为负）；排除已作地图钉的人物
  // （按解析到的 figure_id 去重，避免庙号钉「汉武帝」与本名「刘彻」并列）。
  const pinnedIds = figures.map((f) => f.figure_id).filter((v): v is string => !!v);
  const pinnedNames = figures.map((f) => f.name);
  const idPh = pinnedIds.length ? pinnedIds.map(() => "?").join(",") : "''";
  const namePh = pinnedNames.length ? pinnedNames.map(() => "?").join(",") : "''";
  const periodRs = await db
    .prepare(
      `SELECT f.id, f.name, f.birth_year, f.death_year, f.dynasty, f.identity, f.avatar_icon,
              (SELECT count(*) FROM figure_passages fp WHERE fp.figure_id = f.id) AS pc
       FROM figures f
       WHERE COALESCE(f.birth_year, f.death_year - 60) <= ?
         AND COALESCE(f.death_year, f.birth_year + 60) >= ? - 8
         AND (f.birth_year IS NOT NULL OR f.death_year IS NOT NULL)
         AND (f.birth_year IS NULL OR f.death_year IS NULL OR (f.death_year - f.birth_year BETWEEN 5 AND 120))
         AND f.id NOT IN (${idPh})
         AND f.name NOT IN (${namePh})
       ORDER BY pc DESC
       LIMIT 12`,
    )
    .bind(meta.year, meta.year, ...pinnedIds, ...pinnedNames)
    .all<Record<string, unknown>>();

  const periodFigures: AtlasPeriodFigure[] = periodRs.results.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    birth_year: (r.birth_year as number) ?? null,
    death_year: (r.death_year as number) ?? null,
    dynasty: String(r.dynasty || ""),
    identity: String(r.identity || ""),
    avatar_icon: (r.avatar_icon as string) || null,
  }));

  const data: AtlasSnapshotDetail = { meta, capitals, figures, periodFigures };

  kvPutSafe(c, cacheKey, JSON.stringify(data));
  return c.json(data);
});

app.route("/api/auth", authRoutes);
app.route("/api/user", userRoutes);

export default app;
