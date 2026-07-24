# 穿越·兰台 主站（timslip-work / timeslip.work）— AGENTS 指南

> 本文件是 Trae IDE 的项目入口。详细技术指引见 [CLAUDE.md](./CLAUDE.md)，产品/技术规格见 [docs/](./docs/)。

## 一、项目定位

**穿越·兰台主站** 是「穿越兰台」产品线的 PC 主站，二十四史数字兰台 —— 通史中枢、信史源头、可视化俯瞰。主站做**横向 × 工具化 × 概览**；子游戏《穿越·史记》做**纵深 × 游戏化 × 沉浸**；小程序「穿越圈」做**移动端社区 × 轻互动**。

### 产品线矩阵

| 项目 | 域名 / 标识 | 技术栈 | 定位 |
|------|------------|--------|------|
| **穿越·兰台 主站** | `timeslip.work` | React 19 + Vite + Hono + Cloudflare Workers + Turso | PC 主站，二十四史阅读/检索/可视化 |
| **穿越·史记** | `shiji.timeslip.work` | React 19 + Vite + Hono + Cloudflare Workers | PC 子站，Ink 视觉小说 + 史记互动阅读 |
| **穿越圈** | 小程序 `wx515b70782ea1aaf3` | 原生小程序 + 云开发 | 移动端社区 / 轻互动 / 用户体系 |

### 三端协同

- **数据层独立**：主站用 Turso（libSQL），小程序用云开发文档数据库，目前不共享
- **CORS 已互通**：主站 Worker 的 CORS 白名单放行了 `timeslip.work` / `shiji.timeslip.work` 及所有 `*.timeslip.work` 子域，小程序按需走云函数桥接
- **内容体系共享**：二十四史 / 人物 / 朝代 / 舆图的世界观三端一致；主站是权威数据源
- **未来打通**：用户体系可通过主站 API + 小程序云函数桥接（UNIONID 跨端）

---

## 二、技术栈速览

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React 19 + Vite 7 + React Router 7 + Framer Motion | SPA，懒加载 + 空闲预加载 + AnimatePresence 转场 |
| 首页动效 | 自研 Canvas 2D / WebGL | 历史长河粒子、水墨旋涡、空间扭曲、奇点湮灭 |
| 图谱 | 3d-force-graph + three.js + d3-force | 人物 3D 力导向图 |
| 舆图 | MapLibre GL + Turf.js | 历史地图交互 + 空间计算 |
| 繁简 | opencc-js | 简繁转换 |
| 后端 | Hono 4 + Cloudflare Workers | 单 Worker 同源部署 |
| 数据库 | Turso（libSQL/SQLite，东京区） | 24 部史书 / 3142 卷 / 49498 条原文 |
| 缓存 | Cloudflare KV | 三级 TTL 热路径缓存 |
| 存储 | R2（AVATAR_BUCKET + ASSETS_BUCKET）+ Cloudflare Images | 人物头像 + 视觉资产 |
| 部署 | Cloudflare Workers + Wrangler 4.88 | 全球边缘网络 |
| 类型 | TypeScript 5.9 | 三项目引用（app / node / worker） |

> 详细选型见 [docs/TECH_STACK.md](./docs/TECH_STACK.md)。

---

## 三、目录结构

```
timslip-work/
├── src/
│   ├── react-app/              # 前端 SPA
│   │   ├── components/         # 按模块分目录（Timeline/Search/Figure/Atlas/Hub/Common/About/Auth）
│   │   ├── pages/              # 12 个页面组件
│   │   ├── hooks/              # useApi/useSearch/useTimeline/useMediaQuery/useFigureAssets
│   │   ├── data/               # api.ts/types.ts/timeline.ts/bookIntros.ts/figure-assets.ts
│   │   ├── services/           # authClient.ts
│   │   ├── store/              # authStore.tsx
│   │   ├── styles/             # variables.css（设计 token）/ fonts.css
│   │   └── types/              # auth.ts
│   └── worker/                 # Hono Worker 后端
│       ├── index.ts            # 20+ API 路由（单文件 ~1700 行）
│       ├── db.ts               # Turso libSQL 适配器（复刻 D1 接口）
│       ├── types.ts            # 后端返回类型
│       ├── lib/                # crypto.ts
│       ├── middleware/         # auth.ts
│       └── routes/             # auth.ts / user.ts
├── public/
│   ├── assets/dynasties/       # 24 张朝代专属壁纸
│   ├── atlas/                  # 舆图 GeoJSON（33 帧疆域 + 底图 + 索引）
│   ├── fonts/                  # 马善政毛笔楷书子集
│   └── logo/                   # 3 套 SVG logo + PNG
├── docs/                       # 产品/技术文档（PRD/TECH_STACK/API_SPEC/DATA_LAYER 等 14 篇）
├── migrations/                 # SQL 迁移
├── seed/                       # 种子数据
├── scripts/                    # 灌数/抓取脚本（TS 用 tsx，Python 做清洗）
├── wrangler.json               # Cloudflare Workers 配置
├── vite.config.ts              # Vite + Cloudflare 插件 + 自定义 SPA fallback
├── CLAUDE.md                   # 详细技术指引（Claude Code / agent 必读）
└── AGENTS.md                   # 本文件（Trae IDE 入口）
```

---

## 四、Agent 工作流（Trae IDE）

1. **先读规则**：[.trae/rules/project-rules.md](./.trae/rules/project-rules.md)
2. **读详细指引**：[CLAUDE.md](./CLAUDE.md)（架构、约定、坑点）
3. **按任务加载 skill**（`.trae/skills/`）：
   - 改后端 API / Worker → `cloudflare-workers-hono`
   - 改数据库 / SQL / 灌数 → `turso-libsql-adapter`
   - 改缓存逻辑 → `kv-cache-strategy`
   - 改搜索 → `chinese-fts-search`
   - 改舆图 → `maplibre-historical-atlas`
   - 改人物图谱 → `figure-3d-graph`
4. **读产品文档**：动手前先读 `docs/` 下相关 PRD
5. **改前/后端类型**：`src/worker/types.ts` 与 `src/react-app/data/types.ts` 必须同步
6. **改 wrangler 绑定**：必须 `npm run cf-typegen` 刷新类型
7. **提交前**：`npm run check`（tsc + build + dry-run deploy）

---

## 五、常用命令

```bash
npm run dev          # Vite 开发服务器 → http://localhost:5173
npm run build        # tsc -b + vite build
npm run check        # tsc + vite build + wrangler deploy --dry-run（提交前跑）
npm run lint         # ESLint
npm run cf-typegen   # 改动 wrangler.json 绑定后必跑
npm run deploy       # wrangler deploy → Cloudflare Workers
```

**本地开发要点**：
- `npm run dev` 前先关掉终端代理，否则连不上本地 Turso
- 本地库用 `turso dev`（HTTP，无需 token）；线上东京库走 `libsql://` 带 token
- 凭证放 `.dev.vars`（复制自 `.dev.vars.example`），勿提交真实 token

---

## 六、Cloudflare 资源绑定

| 绑定名 | 类型 | 用途 |
|--------|------|------|
| `KV` | KV Namespace | 三级 TTL 热路径缓存（remote: true，本地直连线上） |
| `TURSO_DATABASE_URL` | vars | Turso 库地址 |
| `TURSO_AUTH_TOKEN` | secret | Turso 认证 token（在 `.dev.vars`） |
| `AVATAR_BUCKET` | R2 Bucket | 人物头像 |
| `ASSETS_BUCKET` | R2 Bucket | 人物视觉资产（多风格/多类型） |
| `IMAGES` | Images Binding | 图片缩放、格式转换（webp） |
| `USER_DB` | D1 Database | 用户库（timeslip-shiji-users） |
| `RATE_LIMITER` / `SEARCH_LIMITER` | Rate Limiter | 限流（可选，本地优雅跳过） |

> 改绑定后必须 `npm run cf-typegen`。

---

## 七、相关资源

- 线上地址：https://timslip-work.winniringy.workers.dev
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Hono 文档](https://hono.dev/)
- [Turso 文档](https://docs.turso.tech/)
- [MapLibre GL 文档](https://maplibre.org/)
- [3d-force-graph](https://github.com/vasturiano/3d-force-graph)

本项目由 [TRAE AI](https://www.trae.ai/) 全力打造。
