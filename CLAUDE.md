# CLAUDE.md

本文件指导 Claude Code（claude.ai/code）在本仓库中工作。

## 项目简介

「穿越·兰台」（timeslip.work）：二十四史数字化阅读 / 检索 / 可视化站点。**全站中文**——文档、UI、代码注释、commit 一律用中文。主站做横向×工具化×概览（通史中枢、信史源头），子游戏《穿越·史记》做纵深×游戏化×沉浸。

产品与技术规格以 `docs/` 为准，动手前先读相关文档：

- `PRD.md`（产品总纲）、`TECH_STACK.md`（选型）、`FRONTEND_ARCH.md`（前端架构）
- `API_SPEC.md`（API 规格）、`DATA_LAYER.md`（数据层/表结构）、`INGEST_SPEC.md`（灌数）、`DATA_CLEANING.md`（清洗）
- `PRD_FIGURES.md`（人物模块）、`PRD_ATLAS.md`（舆图模块）
- `MIGRATE_TURSO.md`（D1→Turso 迁移）、`DEPLOYMENT.md`（部署）、`SCRAPE_PLAN_二十四史.md`（抓取计划）

## 技术栈

前端 React 19 + Vite 7 + React Router 7 + Framer Motion（首页黑洞/虫洞动效走 WebGL Canvas）。后端 Hono 4 跑在 Cloudflare Workers；数据库 Turso（libSQL/SQLite，东京 `aws-ap-northeast-1` 区）；缓存 Cloudflare KV；头像存 R2（`AVATAR_BUCKET`）。地图用 MapLibre GL + Turf。TypeScript 全程。

> 2026-06-24 从 Cloudflare D1 迁到 Turso（D1 免费版单库 500MB 撞顶），详见 `docs/MIGRATE_TURSO.md`。

## 常用命令

```bash
npm run dev          # Vite 开发服务器 → http://localhost:5173
npm run build        # tsc -b + vite build
npm run check        # tsc + vite build + wrangler deploy --dry-run（提交前跑）
npm run lint         # ESLint
npm run cf-typegen   # 改动 wrangler.json 绑定后必跑，重生成 worker-configuration.d.ts
npm run deploy       # wrangler deploy → Cloudflare Workers
```

**本地开发要点**（见记忆/README）：

- `npm run dev` 要先关掉终端代理，否则连不上本地 Turso。
- 本地库用 `turso dev`（HTTP，无需 token）；线上东京库走 `libsql://` 带 token。凭证放 `.dev.vars`（复制自 `.dev.vars.example`，勿把真实 token 提交进 git）。
- 改了 `wrangler.json` 的 KV/R2/DB 绑定后，必须 `npm run cf-typegen` 刷新类型。

## 架构

### 单 Worker 同源部署

`wrangler.json` 里 `run_worker_first: ["/api/*"]`：`/api/*` 打到 Hono Worker（`src/worker/`），其余走 SPA fallback（`dist/client`）。前端和 API 同源，无跨域。CORS 白名单只放 `timeslip.work` 系域名 + `localhost:5173`。

### 后端（`src/worker/`）

- `index.ts`——所有 Hono 路由（~900 行，单文件）。路由清单见 `docs/API_SPEC.md`；主要有 `/api/text/:id`、`/api/search`、`/api/timeline`、`/api/books/*`、`/api/chapters/:id`、`/api/entity/*`、`/api/figures/*`、`/api/avatar/:id`、`/api/asset/:key`。
- `db.ts`——**Turso 适配器**：把 `@libsql/client/web` 包成 Cloudflare D1 同款接口（`.prepare().bind().all()/.first()/.run()`），调用点几乎零改动。用 `/web` 客户端（纯 fetch，可在 workerd 跑）。**每请求 `getDb(c.env)` 新建 client**，execute 即一次 fetch，开销可忽略——不要缓存 client 到模块作用域。
- `types.ts`——后端返回类型。

约定：

- **KV 热路径缓存**：passage / timeline / figures graph 等读接口，先查 `c.env.KV.get(key)`，miss 再查库并回写（`expirationTtl` 常见 7 天 = 604800）。改数据后注意缓存失效。
- **限流**中间件：仅当 `RATE_LIMITER` 绑定存在时启用，本地无绑定时优雅跳过（`c.env.RATE_LIMITER` 为 undefined 不报 500）。
- **错误统一**走 `errorResponse(code, message, status)`，返回 `{ error: { code, message } }`。
- **反序列化**：DB 里 JSON 字段（`glosses`、`book_ids`）和 0/1 布尔（`is_active`）在 `deserializeX()` 里还原，别在路由里散写 `JSON.parse`。
- **中文检索**：FTS5 + bigram 预处理，`bm25()` 排序。查询词入库前经 `toBigrams()` 切二元组，须与灌数管线保持一致（`src/worker/index.ts` 与脚本里各有一份，改动要同步）。

### 前端（`src/react-app/`）

- `App.tsx`——路由表：`/`(Home) `/search` `/books/:id` `/read/*` `/text/*` `/hub` `/figures` `/figures/:id` `/atlas`(ComingSoon 占位) `/about`。用 `AnimatePresence` 做转场，`usePreloadRoutes` 预加载。
- `pages/`——页面级组件（含 `AtlasPage.tsx` 等在建页）。
- `components/`——按模块分目录：`Timeline/`（首页时间轴 + 黑洞/虫洞/漩涡 Canvas 动效）、`Search/`、`Figure/`、`Atlas/`、`Hub/`、`Common/`（Header/Footer/Loading/ErrorBoundary）、`About/`。每个模块自带 `*.css`。
- `hooks/`——`useApi`、`useSearch`、`useTimeline`、`useMediaQuery`。
- `data/`——`api.ts`（API 客户端）、`types.ts`（前端类型，与 worker `types.ts` 独立，改接口两边都要动）、`bookIntros.ts`、`timeline.ts`。
- `styles/`——`variables.css`（设计 token）、`fonts.css`（马善政书法字体子集）。

## 数据层与灌数

- Turso 东京库：24 部史书 / 3142 卷 / 49498 条原文。表结构在 `migrations/`（`001_initial.sql` 核心，`002_figures.sql`/`003_figure_gender.sql` 人物）；表定义详解见 `docs/DATA_LAYER.md`。
- 种子 SQL 在 `seed/`（按史书分目录 + `books.sql`/`dynasties.sql`），人物数据在 `seed/figures/`。
- 灌数/抓取脚本在 `scripts/`：TS 用 `tsx` 跑（`import-shiji.ts`、`import-ershisishi*.ts`、`load-seed-remote.mjs`），Python 做清洗/断句/白话（`punctuate_classical.py`、`generate_vernacular.py`、`clean_wyg_headers.py`）；人物抽取在 `scripts/extract-figures/`，舆图 GeoJSON 构建在 `scripts/atlas/`。
- 抓取来源与坑（Kanripo 编号≠正史顺序、7 部 WYG 截断走殆知阁兜底、CBDB 对先秦秦汉覆盖差且按名直并会投毒）见 `docs/SCRAPE_PLAN_二十四史.md`、`docs/DATA_CLEANING.md`。
- 舆图疆域底稿用 historical-basemaps（GPL-3.0，需署名「据 historical-basemaps / CHGIS 改绘」）；谭其骧《中国历史地图集》只作人工改绘参考、不描摹瓦片。详见 `docs/PRD_ATLAS.md`。

## 约定

- 语言：所有产出（代码注释、文档、UI 文案、commit message）用中文。
- 提交前跑 `npm run check`（tsc + build + dry-run deploy）。
- 改 API 返回结构：`src/worker/types.ts` 与 `src/react-app/data/types.ts` 两侧同步。
- 改绑定：跑 `npm run cf-typegen`。
- 敏感值（Turso token 等）只进 `.dev.vars`，不进 git。
