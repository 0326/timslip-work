# 穿越·兰台（timeslip.work）

> 穿越兰台，亲历青史 · 一河贯古今，二十四史，逆流可溯

二十四史的「数字兰台」——通史中枢、信史源头、可视化俯瞰。主站做横向 × 工具化 × 概览；子游戏（《穿越·史记》）做纵深 × 游戏化 × 沉浸。

## 技术栈

| 层 | 技术 | 版本 | 说明 |
|----|------|------|------|
| 前端框架 | React | 19.2.1 | SPA 单页应用 |
| 构建工具 | Vite | ^7.0.0 | 配合 @cloudflare/vite-plugin |
| 路由 | React Router DOM | ^7.18.0 | 懒加载 + 空闲预加载 + AnimatePresence 切换动画 |
| 动画 | Framer Motion | ^12.40.0 | 路由过渡、组件交互动效 |
| 首页动效 | 自研 Canvas 2D / WebGL | — | 历史长河粒子、水墨旋涡、空间扭曲、奇点湮灭 |
| 人物关系图谱 | 3d-force-graph + three.js + d3-force | ^1.80 / ^0.185 / ^3.0 | 3D 力导向图 |
| 舆图 | MapLibre GL + Turf.js | ^5.24 / ^7.3 | 历史地图交互 + 空间计算 |
| 繁简转换 | opencc-js | ^1.3.1 | 简繁体转换 |
| 截图渲染 | html-to-image | ^1.11.13 | Canvas 动效截图（奇点湮灭粒子化） |
| 后端框架 | Hono | 4.11.1 | Cloudflare Workers API 路由 |
| 数据库 | Turso（libSQL/SQLite，东京区） | — | 24 部史书 / 3142 卷 / 49498 条原文 |
| 缓存 | Cloudflare KV | — | 三级 TTL 热路径缓存 |
| 对象存储 | Cloudflare R2 | — | 人物头像（AVATAR_BUCKET）+ 视觉资产（ASSETS_BUCKET） |
| 图像处理 | Cloudflare Images | — | R2 图片缩放、格式转换（webp） |
| 部署 | Cloudflare Workers + Wrangler | 4.88.0 | 全球边缘网络 |
| 类型系统 | TypeScript | 5.9.3 | 三项目引用（app / node / worker） |

> 数据库于 2026-06-24 从 Cloudflare D1 迁移至 Turso（D1 免费版单库 500MB 撞顶）。详见 [docs/MIGRATE_TURSO.md](./docs/MIGRATE_TURSO.md)。

## 页面路由

| 路径 | 页面 | 功能 | 加载方式 |
|------|------|------|----------|
| `/` | Home | 首页时间轴 + Canvas 历史长河动效（移动端降级为竖向列表） | 直接导入 |
| `/search` | SearchPage | 全文检索（300ms 防抖），含兰台书架侧栏 | lazy |
| `/books/:id` | BookPage | 书籍导言 + 完整目录（按卷/篇分组） | lazy |
| `/read/*` | ReaderPage | 篇章原文阅读，含白话/注释、前后篇导航 | lazy |
| `/text/*` | TextPage | 段落古文原文详情 | lazy |
| `/hub` | HubPage | 二十四史进度看板 | lazy |
| `/figures` | FigurePage | 人物总览（列表/3D 关系图双视图）+ 筛选器 | lazy |
| `/figures/:id` | FigureDetailPage | 人物详情、原文、关系网络、多风格视觉资产 | lazy |
| `/atlas` | AtlasPage | 交互式历史地图，时间轴滑块 + 都城/人物标注 | lazy |
| `/about` | AboutPage | 项目介绍 | lazy |

路由切换使用 `AnimatePresence` 实现淡入淡出过渡，并通过 `usePreloadRoutes()` 在空闲时预加载所有懒加载 chunk，消除首次切换闪烁。

## 项目结构

```
timslip-work/
├── src/
│   ├── react-app/                    # 前端 SPA
│   │   ├── components/
│   │   │   ├── Timeline/             # 首页时间轴
│   │   │   │   ├── Timeline.tsx      # 主时间轴（横向滚动 + 惯性运动 + clip-path 背景切换）
│   │   │   │   ├── TimelineMobile.tsx # 移动端竖向卷轴列表
│   │   │   │   ├── DynastyNode.tsx    # 朝代节点按钮
│   │   │   │   ├── RiverCanvas.tsx    # 历史长河粒子（3 层视差墨色粒子，< 300 粒子）
│   │   │   │   ├── VortexCanvas.tsx   # 水墨旋涡（6 臂对数螺旋，hover 向心收紧）
│   │   │   │   ├── WarpCanvas.tsx     # 空间扭曲（WebGL shader 引力透镜）
│   │   │   │   └── ImplosionCanvas.tsx# 奇点湮灭（截图→16000 粒子螺旋坠入，灭霸式吸入）
│   │   │   ├── Search/               # 全文检索（搜索栏 + 结果列表 + 兰台书架）
│   │   │   ├── Figure/               # 人物模块
│   │   │   │   ├── FigureCard.tsx    # 人物卡片
│   │   │   │   ├── FigureSymbol.tsx  # 人物符号
│   │   │   │   ├── figure-game.css   # 人物游戏样式
│   │   │   │   ├── figure-graph.css  # 关系图样式
│   │   │   │   └── figure.css        # 人物通用样式
│   │   │   ├── Atlas/                # 舆图（MapLibre 地图 + 时间轴 scrubber）
│   │   │   │   ├── AtlasMap.tsx      # 地图主组件
│   │   │   │   ├── AtlasPanel.tsx    # 信息面板
│   │   │   │   ├── AtlasScrubber.tsx # 时间轴滑块
│   │   │   │   ├── atlasApi.ts       # 舆图 API
│   │   │   │   ├── emperors.ts       # 帝王数据
│   │   │   │   └── types.ts          # 舆图类型
│   │   │   ├── Hub/                  # 兰台总目（进度看板 + 游戏卡片）
│   │   │   ├── Common/               # Header / Footer / Loading / ErrorBoundary
│   │   │   └── About/                # 关于页
│   │   ├── pages/                    # 12 个页面组件（见路由表）
│   │   ├── hooks/                    # 自定义 Hooks
│   │   │   ├── useApi.ts            # 通用数据请求（SWR 模式 + localStorage 持久化）
│   │   │   ├── useTimeline.ts       # 时间轴数据获取
│   │   │   ├── useSearch.ts         # 搜索（内置 300ms 防抖）
│   │   │   ├── useFigureAssets.ts   # 人物资产按需懒加载
│   │   │   └── useMediaQuery.ts     # 响应式媒体查询 + prefers-reduced-motion
│   │   ├── styles/
│   │   │   ├── variables.css         # 设计 Token（宣纸底色、朱砂红、书法字体等）
│   │   │   └── fonts.css            # @font-face（马善政楷书子集）
│   │   ├── data/
│   │   │   ├── api.ts               # API 客户端（三级 TTL 缓存 + 并发合并）
│   │   │   ├── types.ts             # 前后端共享类型
│   │   │   ├── timeline.ts          # 24 朝代静态数据
│   │   │   ├── bookIntros.ts        # 24 部正史导言
│   │   │   └── figure-assets.ts     # 人物视觉资产工具函数
│   │   ├── App.tsx                   # 路由入口
│   │   ├── main.tsx                  # 应用入口
│   │   └── index.css                # 全局样式
│   └── worker/                        # Hono Worker 后端
│       ├── index.ts                  # 20+ API 路由
│       ├── db.ts                     # Turso libSQL 适配器（复刻 D1 接口）
│       └── types.ts                  # 后端类型定义
├── public/
│   ├── assets/dynasties/             # 24 张朝代专属壁纸 + 1 默认灰底（1216×912 JPEG）
│   ├── atlas/                        # 舆图数据
│   │   ├── atlas-data.json           # 舆图元数据索引
│   │   ├── basemap.geojson           # 底图 GeoJSON
│   │   └── snapshots/                # 33 帧 .geojson 历史疆域边界数据
│   ├── fonts/
│   │   └── MaShanZheng-subset.woff2  # 马善政毛笔楷书（子集化，仅含书名用字）
│   └── logo/                         # 3 套 SVG logo + 多尺寸 PNG
├── docs/                              # 产品/技术文档
├── wrangler.json                      # Cloudflare Workers 配置
├── vite.config.ts                     # Vite + Cloudflare 插件 + SPA fallback
├── tsconfig.json                       # TypeScript 三项目引用
├── eslint.config.js                    # ESLint 扁平配置
└── index.html                          # HTML 入口（lang="zh-CN"）
```

## API 端点

Worker 部署于 Cloudflare Workers，CORS 限 `timeslip.work` 域及 localhost，全局限流 100 req/min/IP。

### 二十四史阅读

| 方法 | 端点 | 缓存 | 说明 |
|------|------|------|------|
| GET | `/api/books` | STATIC (∞) | 二十四史列表（附导入卷数） |
| GET | `/api/books/:id` | STATIC (∞) | 单本书详情 + 卷列表 |
| GET | `/api/books/:id/catalog` | STATIC (∞) | 书籍完整目录 |
| GET | `/api/chapters/:id` | STATIC (∞) | 篇章详情 + 前后篇导航 |
| GET | `/api/text/:id` | KV 7d | 段落原文 |
| GET | `/api/search` | DYNAMIC (5min) | 全文检索（FTS5 bigram + LIKE 兜底） |
| GET | `/api/timeline` | KV 7d | 时间轴数据 |
| GET | `/api/health` | — | 健康检查 |

### 人物模块

| 方法 | 端点 | 缓存 | 说明 |
|------|------|------|------|
| GET | `/api/figures` | KV (朝代 bucket) | 人物列表（分页 / 朝代 / 身份 / 星级筛选） |
| GET | `/api/figures/:id` | SEMI (30min) | 人物详情 + 相关原文 |
| GET | `/api/figures/:id/relations` | SEMI (30min) | 人物关系 |
| GET | `/api/figures/graph` | SEMI (30min) | 3D 关系图谱（top-N + ego 子图） |
| GET | `/api/figures/:id/assets` | SEMI (30min) | 人物所有风格资产 |
| GET | `/api/figures/:id/assets/:style` | DYNAMIC (5min) | 某风格资产 |
| GET | `/api/art-styles` | STATIC (∞) | 美术风格列表 |

### 资产与舆图

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/avatar/:id` | 头像（R2 AVATAR_BUCKET） |
| POST | `/api/avatar/:id/generate` | AI 头像生成（TRAE text_to_image） |
| POST | `/api/admin/assets/upload` | 管理员上传视觉资产到 R2 |
| GET | `/api/asset/:key` | R2 大对象代理（CF Images 缩放 + webp 转换） |
| GET | `/api/atlas/snapshots` | 舆图帧索引 |
| GET | `/api/atlas/snapshots/:slug` | 舆图单帧详情 |

## 数据层

### Turso 东京库

- **数据规模**：24 部史书 / 3142 卷 / 49498 条原文
- **全文检索**：FTS5 + bigram 预处理，`bm25()` 排序，LIKE 兜底
- **连接方式**：`@libsql/client/web`，每请求构造 client（/web 客户端开销可忽略）
- **本地开发**：`turso dev` 启动本地 libSQL，无需 token

### 三级 TTL 缓存

| 级别 | TTL | 适用 | 特殊处理 |
|------|-----|------|----------|
| STATIC | ∞ | 二十四史列表 / 目录 / 篇章 | 写入 localStorage 跨会话持久化 |
| SEMI | 30min | 段落 / 人物 / 关系图 | — |
| DYNAMIC | 5min | 搜索 / 列表分页 / 资产 | — |

并发请求自动合并（inflight map），KV 缓存 800ms 超时降级。

### 朝代时间轴

- 24 个朝代节点，时间跨度前 2550 年 ~ 1644 年
- 前 9 个（五帝 → 西汉）已开启穿越（`is_active: true`）
- 后 15 个（东汉 → 明）已配备专属水墨国风壁纸，尚未开启
- 数据静态导出于 `src/react-app/data/timeline.ts`，不走网络请求

### 舆图数据

- 33 帧 GeoJSON 疆域边界数据（`public/atlas/snapshots/`）
- 底图 GeoJSON + 元数据索引（`public/atlas/atlas-data.json`）
- MapLibre GL 渲染 + Turf.js 空间计算

### 人物视觉资产

- 4 种美术风格：国风（classical）、二次元（anime）、写实（realistic）、Q 版（chibi）
- 资产类型：头像、半身像、全身像、背景、CG、Q 版、表情等
- R2 存储 + Cloudflare Images 缩放转码（`?w=` 参数触发）
- 支持本地静态资产兜底 + R2 远程资产合并

## 设计系统

### 色彩

| Token | 值 | 用途 |
|-------|------|------|
| `--bg` | `#f5f0e8` | 宣纸底色 |
| `--bg-dark` | `#e8e0d4` | 深宣纸 |
| `--ink` | `#1a1a1a` | 墨黑正文 |
| `--ink-light` | `#3a3a3a` | 淡墨辅助 |
| `--muted` | `#8a7e6e` | 远山灰褐 |
| `--rule` | `#d4c9b8` | 分割线 |
| `--accent` | `#c23a2b` | 朱砂红（强调色） |
| `--accent-light` | `#e85d4e` | 浅朱砂（hover） |

### 字体

| Token | 字体栈 | 用途 |
|-------|--------|------|
| `--font-serif` | CrimsonPro, Noto Serif SC, Songti SC, serif | 标题/书名 |
| `--font-sans` | InstrumentSans, Noto Sans SC, PingFang SC, sans-serif | 正文/UI |
| `Ma Shan Zheng` | 马善政毛笔楷书（子集化 woff2） | 朝代名称、品牌标识 |

### 间距与动效

- 间距体系：xs(4px) / sm(8px) / md(16px) / lg(24px) / xl(48px)
- 圆角：sm(2px) / md(4px)
- 动效曲线：水墨晕染 ease / 滚动 ease
- 4 级时长：0.2s / 0.3s / 0.5s / 0.8s
- 所有 Canvas 动效尊重 `prefers-reduced-motion` 媒体查询

## Cloudflare 资源绑定

| 绑定名 | 类型 | 用途 |
|--------|------|------|
| `KV` | KV Namespace | 三级 TTL 热路径缓存 |
| `AVATAR_BUCKET` | R2 Bucket | 人物头像存储 |
| `ASSETS_BUCKET` | R2 Bucket | 人物视觉资产（多风格/多类型） |
| `IMAGES` | Images Binding | 图片缩放、格式转换 |

## 开发

### 环境准备

```bash
npm install
```

### 配置环境变量

复制 `.dev.vars.example` 为 `.dev.vars`，填入 Turso 凭证：

```bash
cp .dev.vars.example .dev.vars
```

```env
# 方式 A：直连线上东京库（wrangler.json 已配置 remoteBindings:true，KV 走本地缓存）
TURSO_DATABASE_URL=libsql://timslip-db-<org>.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=<turso db tokens create 生成>

# 方式 B：本地 libSQL（turso dev，无需 token）
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
```

> `wrangler.json` 中 `KV` 未标记 `remote: true`，本地开发走 miniflare 本地缓存；`TURSO_DATABASE_URL` 标记在 `vars` 中会走远程连接。

### 启动开发服务器

```bash
npm run dev
```

应用运行在 http://localhost:5173

Vite 配置了自定义 SPA fallback 插件：非 API / 非文件扩展名请求改写为 `/index.html`，配合 `run_worker_first: ["/api/*"]` 实现前后端同端口开发。

### 其他命令

```bash
npm run build        # 类型检查 + 构建
npm run check        # tsc + vite build + wrangler deploy --dry-run
npm run lint         # ESLint 检查
npm run cf-typegen   # 重新生成 worker-configuration.d.ts
npm run preview      # 构建后本地预览
```

## 部署

```bash
npm run build && npm run deploy
```

部署到 Cloudflare Workers 全球边缘网络。`wrangler.json` 配置静态资产目录为 `dist/client`，未匹配路径按 SPA 模式回退到 `index.html`。

线上地址：https://timslip-work.winniringy.workers.dev

## 文档

| 文档 | 说明 |
|------|------|
| [PRD.md](./docs/PRD.md) | 产品需求文档 |
| [TECH_STACK.md](./docs/TECH_STACK.md) | 技术栈选型 |
| [API_SPEC.md](./docs/API_SPEC.md) | API 规格 |
| [DATA_LAYER.md](./docs/DATA_LAYER.md) | 数据层设计 |
| [DATA_CLEANING.md](./docs/DATA_CLEANING.md) | 数据清洗 |
| [INGEST_SPEC.md](./docs/INGEST_SPEC.md) | 数据灌入规格 |
| [FRONTEND_ARCH.md](./docs/FRONTEND_ARCH.md) | 前端架构 |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | 部署文档 |
| [MIGRATE_TURSO.md](./docs/MIGRATE_TURSO.md) | D1 → Turso 迁移记录 |
| [PRD_FIGURES.md](./docs/PRD_FIGURES.md) | 人物模块 PRD |
| [PRD_FIGURES_RANKING.md](./docs/PRD_FIGURES_RANKING.md) | 人物排行 PRD |
| [PRD_FIGURE_CHAT.md](./docs/PRD_FIGURE_CHAT.md) | 人物对话 PRD |
| [PRD_ATLAS.md](./docs/PRD_ATLAS.md) | 舆图模块 PRD |
| [SCRAPE_PLAN_二十四史.md](./docs/SCRAPE_PLAN_二十四史.md) | 二十四史抓取计划 |

## 致谢

本项目由 [TRAE AI](https://www.trae.ai/) 全力打造，感谢 TRAE 团队提供的算力支持。
