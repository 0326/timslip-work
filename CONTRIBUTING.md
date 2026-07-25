# 穿越·兰台主站（timslip-work）共建文档

> 域名：`timeslip.work` | 定位：PC 主站，二十四史数字兰台（通史中枢、信史源头、可视化俯瞰）
> 发给 AI 时，把本文件作为上下文第一条，AI 即可快速上手。

---

## 一、项目速览

### 1.1 项目定位

**穿越·兰台主站** 是「穿越兰台」产品线的 PC 主站，二十四史数字兰台 —— 通史中枢、信史源头、可视化俯瞰。

**核心规则**：
- 内容数据库使用 Turso（libSQL / SQLite），东京区 24 史 / 3142 卷 / 49498 条原文
- 用户数据库使用 Cloudflare D1（`USER_DB`），生产配置为直连线上
- 认证采用自研 JWT + HttpOnly Cookie，生产 Cookie Domain = `.timeslip.work`
- 存档使用独立 `work_saves` 表（收藏、阅读进度等）
- 所有前端 fetch 必须带 `credentials: 'include'`，否则 Cookie 不会发送

### 1.2 技术栈

| 层 | 技术 | 版本 / 说明 |
|----|------|-------------|
| 前端 | React + TypeScript + Vite | React 19 / TS 5.9 / Vite 7 |
| 路由 | react-router-dom | v7，懒加载 + 预加载 + AnimatePresence 转场 |
| 动效 | framer-motion | ^12 |
| 首页 Canvas | 自研 2D / WebGL | RiverCanvas 长河粒子 / VortexCanvas 水墨旋涡 / WarpCanvas / ImplosionCanvas |
| 人物图谱 | 3d-force-graph + three.js + d3-force | 3D 力导向关系图，ego 子图上限 300 节点 |
| 舆图 | MapLibre GL + Turf.js | 历史地图交互，33 帧疆域 GeoJSON |
| 繁简 | opencc-js | 前端实时简繁转换 |
| 导出图片 | html-to-image | 人物关系图导出 PNG |
| 后端 | Hono + Cloudflare Workers | Hono 4.11 / Wrangler 4.88 |
| 内容数据库 | Turso（libSQL / SQLite） | 东京区，24 史 / 3142 卷 / 49498 条原文，@libsql/client/web 适配器 |
| 用户数据库 | Cloudflare D1 | `USER_DB` = `timeslip-shiji-users` |
| 缓存 | Cloudflare KV | `KV` Namespace，三级 TTL：STATIC ∞ / SEMI 30min / DYNAMIC 5min |
| 存储 | Cloudflare R2 + Cloudflare Images | AVATAR_BUCKET（头像）/ ASSETS_BUCKET（立绘/多风格） |
| 认证 | 自研 JWT + HttpOnly Cookie | PBKDF2-SHA256，Cookie 优先于 Authorization Header；生产 JWT_SECRET 与同域子站一致 |
| 限流 | Cloudflare Rate Limiter | `RATE_LIMITER` / `SEARCH_LIMITER`（可选，未绑定时优雅跳过） |
| 图标 | lucide-react | 单图标按需导入 |

### 1.3 目录结构

```
timslip-work/
├── public/
│   ├── assets/
│   │   ├── dynasties/          # 24 张朝代专属壁纸（首页动态切换）
│   │   └── silhouettes/        # 9 类人物剪影
│   ├── atlas/                  # 舆图数据
│   │   ├── basemap.geojson     # 底图
│   │   ├── atlas-data.json     # 索引
│   │   └── snapshots/          # 33 帧历史疆域 GeoJSON
│   ├── fonts/                  # MaShanZheng-subset.woff2（马善政毛笔楷书子集）
│   └── logo/                   # 3 套 logo（SVG + PNG 多尺寸）
├── docs/                       # 产品 / 技术文档（PRD、技术选型、API 等 14 篇）
├── migrations/                 # SQL 迁移（USER_DB D1）
│   └── 0001_work_saves.sql     # work_saves 表（work 独立存档）
├── seed/                       # 种子数据
├── scripts/                    # 灌数 / 清洗 / 抓取脚本（TS 用 tsx，Python 做 NLP）
├── src/
│   ├── react-app/              # 前端 SPA
│   │   ├── App.tsx / main.tsx  # 入口
│   │   ├── components/
│   │   │   ├── Timeline/       # RiverCanvas / VortexCanvas / WarpCanvas / ImplosionCanvas / TimelineMobile
│   │   │   ├── Search/         # SearchBar / ResultList / PassageView（搜索结果 + 高亮）
│   │   │   ├── Figure/         # FigureCard / FigureSymbol / 人物图谱 3D
│   │   │   ├── Atlas/          # AtlasMap / AtlasPanel / AtlasScrubber（MapLibre 舆图）
│   │   │   ├── Hub/            # GameCard / ProgressBoard
│   │   │   ├── Auth/           # AuthModal / UserMenu（登录弹窗 / 用户菜单）
│   │   │   ├── Circle/         # 穿越圈入口
│   │   │   └── Common/         # Header / Footer / Loading / ErrorBoundary
│   │   ├── pages/              # 12 个页面
│   │   │   ├── Home.tsx        # 首页（4 套 Canvas 动效 + 朝代卡片）
│   │   │   ├── SearchPage.tsx  # 全文搜索页
│   │   │   ├── BookPage.tsx / ReaderPage.tsx / TextPage.tsx  # 阅读体系
│   │   │   ├── HubPage.tsx     # 游戏 Hub（入口总览）
│   │   │   ├── FigureListPage.tsx / FigureDetailPage.tsx / FigureGraphPage.tsx  # 人物体系
│   │   │   ├── AtlasPage.tsx   # 历史舆图
│   │   │   └── AboutPage.tsx   # 关于页
│   │   ├── hooks/              # useApi / useSearch / useTimeline / useMediaQuery / useFigureAssets
│   │   ├── data/               # api.ts / types.ts / timeline.ts / bookIntros.ts / figure-assets.ts
│   │   ├── services/           # authClient.ts
│   │   ├── store/              # authStore.tsx（Context 模式）
│   │   ├── styles/             # variables.css（设计 token）/ fonts.css
│   │   └── types/              # auth.ts
│   └── worker/                 # Hono Worker 后端
│       ├── index.ts            # 20+ API 路由（单文件 ~1700 行，入口）
│       ├── db.ts               # Turso libSQL 适配器（包装 @libsql/client/web 为 D1 接口）
│       ├── types.ts            # 后端返回类型
│       ├── lib/crypto.ts       # PBKDF2 哈希 / JWT / Cookie
│       ├── middleware/auth.ts  # requireAuth / optionalAuth（Cookie 优先）
│       └── routes/
│           ├── auth.ts         # /api/auth：register/login/logout/check-username
│           └── user.ts         # /api/user：me/save（work_saves 表）/ PATCH me
├── .dev.vars                   # 本地环境变量（.gitignore，不提交）
├── .dev.vars.example           # .dev.vars 模板（可提交，不含真实 token）
├── wrangler.json               # Workers 配置（Turso URL + D1 USER_DB remote + KV remote + R2 + Images）
├── vite.config.ts              # Vite + React + spaFallback 插件 + cloudflare({ remoteBindings: true })
├── worker-configuration.d.ts   # 由 npm run cf-typegen 生成，Bindings 类型
├── CLAUDE.md                   # 详细技术指引（Claude Code / AI agent 必读）
├── AGENTS.md                   # Trae IDE 项目入口
└── README.md
```

---

## 二、本地启动服务

### 2.1 前置要求

```
Node.js  >= 20
npm     >= 10 （或 pnpm，项目已有两种 lock）
（可选，本地灌完整内容时需要）Turso CLI：用于本地 libSQL 开发模式
```

> **不需要** `npx wrangler login` 浏览器跳转 OAuth，也不需要 `turso auth login`。本地直连线上库只需要找 owner 要 4 个 token，写进 `.dev.vars` 即可。
>
> 拿不到 token 的共建者可以直接用 **2.7 兜底零账号模式**（本地 Mock 全套 + Turso 可选本地种子，适合改前端 / Canvas / 舆图样式）。

### 2.2 安装依赖

```bash
cd timslip-work
npm install
```

### 2.3 配置环境变量（✅ 默认：直连线上全套资源，找 owner 要 4 个值填进来）

本项目 `wrangler.json` 默认 USER_DB / KV / AVATAR_BUCKET / ASSETS_BUCKET 所有绑定都是 `remote: true`，且 `vite.config.ts` 默认开启 `remoteBindings: true`。也就是说——git clone 下来**不改任何配置**，只填 `.dev.vars` 里的 4 个值，启动后自动连：
- 线上 D1 用户库（`timeslip-shiji-users`）
- 线上 KV 缓存
- 线上 R2 立绘桶（`timslip-assets`、`timslip-avatars`）
- 线上 Turso 内容库（东京 49498 条 passage）

```bash
# 创建/覆盖 .dev.vars（把 <xxx> 全部替换成 owner 给你的值）
cat > .dev.vars <<'EOF'
# ── Cloudflare（2 个，找 owner 要）──
# ① Cloudflare 最小权限 API Token（90 天过期，Account/D1+KV+R2 Read 权限）
CLOUDFLARE_API_TOKEN=<owner 给的 Cloudflare API Token>

# ② 线上同一个 JWT_SECRET（一字不差，不然验签不过）
JWT_SECRET=<线上同一个 JWT_SECRET>

# ── Turso（2 个，找 owner 要）──
# ③ 线上 Turso 库地址（固定，owner 直接给）
TURSO_DATABASE_URL=libsql://timslip-db-johnfire.aws-ap-northeast-1.turso.io

# ④ Turso 读权限 Token（90 天过期，owner 用 turso db tokens create 生成）
TURSO_AUTH_TOKEN=<owner 给的 Turso 读 token>
EOF
```

> 🚨 **红线（绝对不要做）**：
> - 不要把 `.dev.vars` 提交 git（已在 `.gitignore`，别手贱 `git add -f`）
> - 不要把 4 个 token 贴到 PR / Issue / 任何群聊天 / 截图里
> - token 泄露立刻找 owner 吊销旧的换新的

### 2.4 启动开发服务器

```bash
# ⚠ 启动前先关掉终端代理！否则连不上 Cloudflare / Turso remote bindings
npm run dev
# Vite 启动后访问 http://localhost:5173
```

启动后自动连线上资源：
- **前端**：Vite HMR 热更新，`spaFallback()` 插件处理 SPA 路由
- **Worker API**：`/api/*` 由 `@cloudflare/vite-plugin` 注入 Hono，与生产同源部署逻辑一致
- **USER_DB（D1）**：直连线上真实用户库（`remote: true`）
- **KV**：直连线上真实 KV（`remote: true`）
- **ASSETS_BUCKET / AVATAR_BUCKET（R2）**：直连线上真实立绘桶（`remote: true`）
- **Turso 内容库**：直连线上东京 49498 条 passage

### 2.5 验证启动（三连测）

```bash
# ① 健康检查
curl -s http://localhost:5173/api/health
# 预期：{"ok":true}

# ② Turso 线上库直连测试：搜索「项羽」返回真实史记原文（不是 Mock 示例数据）
curl -s 'http://localhost:5173/api/search?q=项羽' | head -c 500
# → results 里能看到「項王」「垓下」「烏江」等真实原文片段 → Turso 通了

# ③ R2 立绘桶直连测试：返回真实图片 HTTP 200（不是 404 fallback）
curl -sI 'http://localhost:5173/assets/figures/xiangyu/portrait.webp' | head -1
# → HTTP/1.1 200 OK → R2 通了

# ④ D1 用户库直连测试：检查线上已存在用户名
curl -s "http://localhost:5173/api/auth/check-username?username=<线上已注册的用户名>"
# → 返回 {"valid":false,"reason":"username_taken"} → D1 通了
```

### 2.6 常用命令

```bash
npm run dev          # 开发服务器 → http://localhost:5173
npm run build        # tsc -b + vite build → dist/
npm run check        # tsc && vite build && wrangler deploy --dry-run（提交前必跑！）
npm run lint         # ESLint
npm run cf-typegen   # 改完 wrangler.json 绑定后，刷新 worker-configuration.d.ts
npm run preview      # build 后本地预览生产包
npm run deploy       # 先 build，再 wrangler deploy → Cloudflare Workers（需要 wrangler login，一般由 owner 做）
npx wrangler tail    # 线上实时日志（需要 wrangler login）
npx wrangler dev     # 仅跑 Worker（不跑 Vite 前端），纯后端调试用
```

### 2.7 兜底方案：零账号本地开发模式（拿不到 token 时用）

> **适合场景**：还没拿到 owner 给的 4 个 token / 不知道 token 是什么 / 只改前端 UI / Canvas 动效 / 舆图样式，不想碰线上数据。

本项目默认 `wrangler.json` 里所有绑定都是 `remote: true` + `vite.config.ts` 开了 `remoteBindings: true`，这会要求有 Cloudflare token。**零账号模式只需改 2 个文件 + 改 .dev.vars**，所有资源本地 Mock 化：

```bash
# Step 1：安装依赖
npm install
```

```bash
# Step 2：打补丁 —— 去掉所有 remote: true 和 remoteBindings
#         （这两个补丁是幂等的，改完 git diff 检查一下）
#
# 2a. wrangler.json：把以下四处的 "remote": true 注释掉或删掉：
#     - d1_databases[0]（USER_DB）
#     - kv_namespaces[0]（KV）
#     - r2_buckets[0]（AVATAR_BUCKET）
#     - r2_buckets[1]（ASSETS_BUCKET）
#     最简单：找到每行 "remote": true 前面加 //
#
# 2b. vite.config.ts：把 cloudflare({ remoteBindings: true }) 改成 cloudflare()
#     （即删掉 { remoteBindings: true } 参数）
```

```bash
# Step 3：创建 .dev.vars —— TURSO 用【Mock 内存内容库】，完全不需要 token！
cat > .dev.vars <<'EOF'
# ── 零账号推荐配置（Mock 内容库，无需任何 token）──
# TURSO_DATABASE_URL 设为特殊值：mock://local
# Worker 启动时识别到这个前缀就走内存 Mock
TURSO_DATABASE_URL=mock://local
TURSO_AUTH_TOKEN=

# JWT_SECRET 随便填一串长字符串（不需要跟线上一致）
JWT_SECRET=local-dev-only-not-for-production-any-random-string-xxxxxxxxxxxxxxxx
EOF
```

```bash
# Step 4（可选但推荐）：想有真实搜索/阅读数据 → 用本地 Turso CLI + 最小种子集
#         （不用 turso auth login，纯本地跑）
#
# 4a. 安装 Turso CLI
#     macOS:  brew install chiselstrike/tap/turso
#     其他系统：https://docs.turso.tech/cli/install
#
# 4b. 启动本地 libSQL HTTP server
turso dev --db-file ./seed/local_content.db
# → 监听 http://127.0.0.1:8080，保持终端开着

# 4c. 另开一个终端，灌最小种子内容集（10 本书 / 200 条原文 / 50 个人物）
#     （seed/minimal_content.sql 需要项目里有，没有的话找 owner 要或跳过）
npx wrangler d1 execute timslip-db --local \
  --connection=http://127.0.0.1:8080 \
  --file=./seed/minimal_content.sql || true
# 如果上面命令报错没关系，用 mock://local 也能跑（只是搜索结果是示例数据）

# 4d. 把 .dev.vars 里的 TURSO_DATABASE_URL 改成：
# TURSO_DATABASE_URL=http://127.0.0.1:8080
# TURSO_AUTH_TOKEN=
```

```bash
# Step 5：启动！
npm run dev
# → http://localhost:5173
#   - 首页 Canvas × 4 套动效：✅ 完全可用
#   - 舆图 33 帧疆域：✅ 可用（public/atlas 是静态 GeoJSON，不依赖 DB）
#   - 登录 / 注册：✅ 可用（本地 Miniflare D1 空库，注册即可）
#   - 搜索 / 阅读：⚠ Mock 模式返回示例数据；turso dev 模式返回真实种子数据
#   - 人物图谱：⚠ Mock 模式 10 节点示例图；turso dev 模式 50 节点
```

**Mock 内容库工作原理（给 AI/开发者看）**：

当 Worker 识别到 `TURSO_DATABASE_URL === 'mock://local'` 时，`getDb()` 适配器返回一个**内存 Mock Db**：
- `prepare('SELECT ... FROM books ...').all()` → 返回预置的 10 本示例史书
- `prepare('SELECT ... FROM passages ... WHERE text MATCH ?').all()` → 对搜索关键词生成 10 条匹配 passage 示例
- `prepare('SELECT ... FROM figures ...').all()` → 返回 10 个示例人物
- 写操作 `run()` 全部静默成功返回 `{ success: true, meta: { changes: 0 } }`

> 清空本地 D1 / KV：`rm -rf .wrangler/state/v3/d1 .wrangler/state/v3/kv`，重启 `npm run dev`。

**零账号模式功能矩阵**：

| 模块 | Mock 模式 | turso dev 模式 | 说明 |
|------|-----------|----------------|------|
| 首页 Canvas × 4 套 | ✅ 完整 | ✅ 完整 | 纯前端 |
| 舆图 / 朝代时间轴 | ✅ 完整 | ✅ 完整 | GeoJSON 在 public/atlas |
| 人物卡片展示 | ✅ 10 个示例 | ✅ 50 个种子 | Mock 随机头像 |
| 人物图谱 3D | ✅ 10 节点示例图 | ✅ 50 节点种子 | 纯前端渲染 |
| 搜索 | ✅ 返回示例匹配 | ✅ FTS5 真搜索 | turso 有索引 |
| 阅读原文页 | ✅ 示例原文片段 | ✅ 种子原文 200 条 | |
| 收藏 / 阅读进度存档 | ✅ 本地 D1 | ✅ 本地 D1 | work_saves 表 |
| 注册 / 登录 / 改昵称 | ✅ 本地 D1 | ✅ 本地 D1 | users 表 |
| 立绘多风格切换 | ⚠ 返回占位图 | ⚠ 返回占位图 | 没有真实立绘 R2 |
| 部署到线上 | ❌ | ❌ | 需要 wrangler login（合 PR 后由 owner 部署） |

> 🔁 **想切回直连线上模式？**
> 1. `git checkout wrangler.json vite.config.ts` 还原默认
> 2. `.dev.vars` 填回 owner 给的 4 个 token（`CLOUDFLARE_API_TOKEN`、`JWT_SECRET`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`）
> 3. 重启 `npm run dev`

### 2.8 常见问题：启动报错排错

| 报错 / 现象 | 原因 | 解决 |
|-------------|------|------|
| `A request to the Cloudflare API (/accounts/...) failed.` / `Unauthorized` | `CLOUDFLARE_API_TOKEN` 填错 / 过期 | 找 owner 重发新 token，粘贴时别带空格 / 换行 |
| Turso 请求 401 / `Auth failed` | `TURSO_AUTH_TOKEN` 填错 / 过期 | 找 owner 用 `turso db tokens create timslip-db --expiration 90d` 重发 |
| `/api/auth/login` 401，但账号密码没错 | `JWT_SECRET` 和线上不一致 | 找 owner 要线上的 JWT_SECRET，一字不差粘贴 |
| `SqliteError: no such table: users` | 本地 Miniflare D1 没跑迁移 | 零账号模式下执行：`npx wrangler d1 migrations apply timeslip-shiji-users --local` |
| `/api/search` 返回 Mock 示例数据（不是真实原文） | 零账号模式下 Mock 正常现象 | 想用真实数据：填 owner 给的 Turso token 或本地 turso dev + 种子 |
| `/assets/figures/xxx` 404（立绘返回占位图） | 零账号模式 R2 未连线上 | 正常；想看真实立绘：填回 `CLOUDFLARE_API_TOKEN` + 还原 `remote: true` |
| 改了 `wrangler.json` / `vite.config.ts` 没生效 | 没重启 `npm run dev` | 杀死进程，重新 `npm run dev` |
| 本地网络不通 Cloudflare / Turso | 终端代理没关 | `unset http_proxy https_proxy`，关了 Clash/V2Ray 再 `npm run dev` |

---

## 三、连接线上数据库

本项目有**两个**数据库：

| 数据库 | 类型 | 用途 | 连接模式 |
|--------|------|------|----------|
| **USER_DB** | Cloudflare D1 | 用户表 `users` + work 存档表 `work_saves` | `remote: true` 直连线上 |
| **内容库** | Turso (libSQL) | 二十四史原文 / 人物 / 朝代 / 索引 / FTS5 | HTTP / libsql 协议，东京区 |

### 3.1 USER_DB（D1，用户库）

配置文件：[wrangler.json](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/wrangler.json)

```jsonc
"d1_databases": [
  {
    "binding": "USER_DB",
    "database_name": "timeslip-shiji-users",
    "database_id": "5b627cc1-5f18-4eaf-aba8-f7ebe214404f",
    "migrations_dir": "src/worker/migrations",
    "remote": true              // ← 核心：本地 dev 直连线上
  }
]
```

配合 `vite.config.ts` 中的 `cloudflare({ remoteBindings: true })`，本地 `c.env.USER_DB` 即线上真实 D1。

> 👉 **本项目默认已配置好**（`wrangler.json` 所有绑定都是 `remote: true` + vite 默认 `remoteBindings: true`），**不需要你手动改**。共建者没有 Cloudflare 账号的按 **2.3 节** 填 owner 给的 4 个 token 即可，不用 `wrangler login`；拿不到 token 的按 **2.7 零账号模式** 把 `remote: true` 注释掉即可，本地跑 miniflare D1。

**迁移流程（改 USER_DB 表结构）**：

```bash
# 1. 新建迁移文件
# 命名：NNNN_描述.sql
touch src/worker/migrations/0002_add_wechat_openid.sql

# 2. 写 SQL（ALTER / CREATE / INDEX 等）
#    示例：给 users 表加 wechat_openid 字段
cat >> src/worker/migrations/0002_add_wechat_openid.sql <<'EOF'
ALTER TABLE users ADD COLUMN wechat_openid TEXT;
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(wechat_openid);
EOF

# 3. 本地先跑一遍（用 --local 模式，不会真的改线上）
npx wrangler d1 migrations apply timeslip-shiji-users --local

# 4. 确认没问题后跑线上（⚠ 会影响真实用户数据！需要 wrangler login + 权限）
npx wrangler d1 migrations apply timeslip-shiji-users --remote

# 5. （部署时）同域子站若有相同 D1 表，通知 owner 同步迁移文件保证版本一致
```

### 3.2 内容库（Turso / libSQL）

适配器文件：[src/worker/db.ts](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/src/worker/db.ts)

> 👉 **共建者无需读本节前两种方案**：按 2.7 零账号模式的 `mock://local` 或 `turso dev` 最小种子集即可，无需线上 Turso token。

**核心约定**：`@libsql/client/web` 被包装成**与 D1 完全相同**的接口：

```typescript
// 使用方式（和 D1 一模一样）
const db = getDb(c.env);
const row = await db.prepare("SELECT * FROM books WHERE id = ?").bind(bookId).first();
const { results } = await db.prepare("SELECT ...").all();
await db.prepare("UPDATE ...").bind(a, b).run();
```

**不要**在路由里裸用 `createClient()` / `client.execute()`，统一走 `getDb(c.env)`。

**方案 A（有 Turso 权限的开发者）：本地直连线上东京库**

填 `.dev.vars`：
```bash
TURSO_DATABASE_URL=libsql://timslip-db-johnfire.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIs...（找 owner 要或在 Turso dashboard 生成）
```
启动即可，所有查询直接走东京库，本地无需灌数。

**方案 B（本地离线开发）：Turso dev + 自己灌数**

```bash
# 1. 安装 Turso CLI（brew install chiselstrike/tap/turso 或去官网）
# 2. 启动本地 libSQL
turso dev --db-file local.db
# → 默认监听 http://127.0.0.1:8080

# 3. .dev.vars 改为
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=

# 4. 灌数（用 scripts/ 下的 tsx 脚本）
#    示例：导入史记
npx tsx scripts/import-shiji.ts
```

**常用 Turso 命令**：

```bash
# 线上库 SQL shell
turso db shell timslip-db
# 进入后：SELECT COUNT(*) FROM passages;

# 导出线上库
turso db shell timslip-db --dump > dump.sql

# 查看表结构
turso db shell timslip-db ".schema"
turso db shell timslip-db ".schema figures"

# 创建 auth token
turso db tokens create timslip-db
```

### 3.3 KV 缓存（三级 TTL）

配置文件：[wrangler.json](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/wrangler.json)

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "745595ac1e154fe7a44f2d7cfa1f7168",
    "remote": true     // 本地直接连线上 KV
  }
]
```

缓存约定：
- **STATIC 级（∞）**：朝代列表、书籍目录、不常变的元数据
- **SEMI 级（30 min）**：人物列表、书籍简介、舆图索引
- **DYNAMIC 级（5 min）**：搜索结果、人物详情

写缓存时用 `kvPutSafe` + `waitUntil`（Worker 核心规则！）：

```typescript
// ✅ 正确写法：不阻塞响应，后台异步写入 KV
c.executionCtx.waitUntil(
  c.env.KV.put(key, value, { expirationTtl: TTL.SEMI })
);

// ❌ 错误写法：没 waitUntil，Workers 可能在 await 之前就取消，缓存永远写不进去
await c.env.KV.put(key, value);
```

读缓存超时降级（本地 CF 网络不稳时 KV 会挂起）：

```typescript
// ✅ 用 Promise.race 超时 800ms，超时则降级回源查库
const cached = await Promise.race([
  kvGetSafe(c.env.KV, key),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
]);
```

**缓存失效策略（推荐）**：
改数据结构后，**不要手动清 KV**，直接 bump key 前缀版本号：
```typescript
// 改人物列表结构前
const KEY = "figures:list:v6";
// 改完后 → v7，线上自然失效
const KEY = "figures:list:v7";
```

### 3.4 R2 + Cloudflare Images

| 绑定名 | 类型 | 用途 | 本地预览 |
|--------|------|------|----------|
| `AVATAR_BUCKET` | R2 Bucket | 用户头像 / 人物肖像缩略图 | `timslip-avatars-preview` |
| `ASSETS_BUCKET` | R2 Bucket | 人物多风格视觉资产（立绘等） | `timslip-assets`（remote） |
| `IMAGES` | Images Binding | 图片动态缩放、webp 转换 | 本地也走线上服务 |

图片缩放约定：
```
/api/asset/figures/xiangyu.png?w=512   → Cloudflare Images 缩放到 512px 宽
/api/asset/figures/xiangyu.png         → 原图
```

失败优雅回退：Images 服务异常时，返回原图 buffer，绝不让页面 500。

---

## 四、关键架构约定

### 4.1 认证

中间件文件：[src/worker/middleware/auth.ts](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/src/worker/middleware/auth.ts)

```typescript
// Cookie 优先 → Authorization Header 兜底
const token = extractTokenFromCookie(cookieHeader) ?? extractTokenFromHeader(authHeader);
```

Cookie 文件：[src/worker/lib/crypto.ts](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/src/worker/lib/crypto.ts)

生产环境 Cookie 属性：
```
auth_token=<jwt>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=.timeslip.work
```

- `Domain=.timeslip.work` 用于本站及同域子站共享
- 前端所有 fetch **必须** `credentials: 'include'`，**必须**
- 登录成功后，`Set-Cookie` 由后端返回，前端 **不要手动操作** `document.cookie`

生产部署前设置密钥（由 owner 执行）：
```bash
wrangler secret put JWT_SECRET
# 粘贴长随机字符串，若同域子站有同样的认证逻辑，通知 owner 保证密钥一致
```

### 4.2 类型同步（前后端双份）

> ⚠ 本项目前后端**不共享类型文件**（Worker 打包需要独立 tsconfig）。两边改动必须手动同步：

- **后端类型**：`src/worker/types.ts`（API 返回结构）
- **前端类型**：`src/react-app/data/types.ts`（前端消费 API 的类型）

改一个字段 / 加一个接口，两边都要改。建议先改后端类型，再根据它改前端。

例外：`auth.ts` 相关类型在 `src/react-app/types/auth.ts`，认证独立维护。

### 4.3 中文全文搜索（FTS5 + bigram）

核心函数在 `src/worker/index.ts` 的 `toBigrams()`：

```typescript
function toBigrams(s: string): string {
  const t = (s || "").replace(/\s+/g, "");
  if (t.length < 2) return t;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out.join(" ");
}
```

搜索策略：
- **多字查询**：bigram 切词后 `MATCH` + `bm25()` 排序
- **单字查询**：bigram 无法匹配，走 `LIKE '%字%'` 兜底
- ⚠ **硬约束**：`toBigrams()` 的实现必须与 `scripts/` 中的灌数管线完全一致，改动要两边同步，否则搜索结果会对不上灌的索引

### 4.4 Vite + Worker 同源部署

`wrangler.json`：
```jsonc
"run_worker_first": ["/api/*"]
```

含义：
- `/api/*` 请求 → 先进 Hono Worker
- 其他所有路径 → 由 `assets` 托管，走 SPA fallback（`not_found_handling: "single-page-application"`）

`vite.config.ts` 中的 `spaFallback()` 插件在本地 dev 复刻了这一行为：**不要把前端路由加到 `run_worker_first`**，否则 404。

### 4.5 存档表 work_saves

文件：[migrations/0001_work_saves.sql](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/src/worker/migrations/0001_work_saves.sql)

```sql
CREATE TABLE IF NOT EXISTS work_saves (
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL DEFAULT 'default',
  data TEXT NOT NULL,                 -- WorkSaveData JSON 字符串
  updated_at INTEGER NOT NULL,        -- 服务端更新时间
  client_updated_at INTEGER NOT NULL, -- 客户端更新时间（冲突解决）
  version INTEGER NOT NULL DEFAULT 1, -- 乐观锁版本号
  PRIMARY KEY (user_id, slot),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

并发冲突：前端 PUT `/save` 传 `expectedVersion`，与服务端 `version` 不一致返回 **409 conflict**，携带 `serverSave` + `serverVersion`，前端合并后重试。

WorkSaveData 类型（[routes/user.ts](file:///Users/liquanfeng/Desktop/trae-workspace/timslip-work/src/worker/routes/user.ts)）：
```typescript
export interface WorkSaveData {
  favorites?: string[];              // 收藏的人物 / 书籍 / 篇章 ID
  readingProgress?: Record<string, unknown>;  // 阅读进度：{ bookId: { volume, chapter, scrollY } }
  lastVisited?: string;              // 上次访问路径
  [key: string]: unknown;            // 可扩展，保证向后兼容（老存档不会爆）
}
```

---

## 五、优化指南

### 5.1 性能优化 Checklist

| 类别 | 优化点 | 操作方式 |
|------|--------|----------|
| **首屏 LCP** | 首页 KV 图 webp + preload | `index.html` 加 `<link rel="preload" as="image" type="image/webp" href="/images/kv/bg-wudi-v2.jpg">` |
| **首屏 LCP** | 马善政字体子集化 | 已做 `MaShanZheng-subset.woff2`，不要换回全量 TTF |
| **首屏 TBT** | 路由懒加载 + 空闲预加载 | `createBrowserRouter` 用 lazy，`usePreloadRoutes` 在 idle 时预加载 |
| **首屏** | Canvas 降级移动端 | `TimelineMobile.tsx` 用纯列表，低性能设备关闭粒子 |
| **运行时** | 首页粒子数控制 | RiverCanvas < 300 粒子；`prefers-reduced-motion` 停掉动效 |
| **运行时** | 关系图节点上限 | ego 子图 ≤ 300 节点，超出裁剪非关键边 |
| **运行时** | MapLibre 瓦片 | 开启 `optimizeForTerrain: false`，自定义样式图层减少重绘 |
| **运行时** | 搜索防抖 | `useSearch` 内置 300ms debounce，不要在组件层再加 |
| **运行时** | 存档防抖 | 收藏 / 阅读位置更新 1s debounce |
| **API** | 缓存命中率 | 搜索结果 5 min KV；人物详情 30 min；朝代 / 书籍目录 ∞ |
| **API** | `waitUntil` 写 KV | 所有 `KV.put` 必须包 `c.executionCtx.waitUntil(...)` |
| **API** | KV 超时降级 | 本地 remote KV 慢时 800ms 超时回源查库 |
| **DB** | 索引 | 所有 WHERE / JOIN / ORDER BY 字段必须建索引，`EXPLAIN QUERY PLAN` 检查 |
| **DB** | 避免 `SELECT *` | 只读需要字段，`passages.text` 是大字段，列表页不取 |
| **包体** | lucide-react 单导入 | `import { Search } from 'lucide-react'`，不要 `import * as Icons` |
| **包体** | 3D 图谱按需 | `FigureGraphPage` 懒加载，不进首屏 chunk |
| **包体** | MapLibre 字体 | 用系统字体 fallback，不内嵌字体文件 |
| **构建** | `upload_source_maps` | 关闭（已设 false）避免上传大 source map；本地调试保留 sourcemap |
| **Worker** | CPU < 50ms | PBKDF2 是重操作（~20-30ms），不要在循环里调用；批量接口加 cursor 分页 |
| **CDN** | 图片 `?w=` 缩放 | 列表用 256px，详情 1024px，原图仅导出 / 分享时用 |

### 5.2 代码质量优化

```bash
# 提交前一条龙
npm run check
# → tsc -b（含 app / worker / node 三 tsconfig）
# → vite build
# → wrangler deploy --dry-run（检查 bindings / vars 是否齐全）
```

常见坑：
- `error TS2339: Property 'KV' does not exist on type 'Env'` → 跑 `npm run cf-typegen`
- `ReferenceError: require is not defined` → Worker 里用 ESM `import`，不能 `require()`
- Worker 里 `console.log` 线上看不到 → 用 `npx wrangler tail`
- 本地 `ENOENT: no such file or directory` → 关代理再试

### 5.3 可维护性优化

- 路由函数过长 → 拆到 `routes/*.ts`，`index.ts` 里只 `app.route('/api/xxx', xxx)`
- 重复的 KV 读写 → 封到 `kvGetSafe(key)` / `kvPutSafe(key, val, ttl)`
- 前后端字段对齐 → 改后端 types.ts 后复制到前端，diff 检查
- Canvas 动效参数 → 提常量到文件顶部，注释标注「调参点」

---

## 六、提 PR & Issue 共建流程

### 6.1 分支模型

```
main ─── 保护分支，禁止直接 push，Squash Merge
  │
  ├── feat/xxx      新功能
  ├── fix/xxx       Bug 修复
  ├── refactor/xxx  重构（不改行为 / API）
  ├── perf/xxx      性能优化
  ├── docs/xxx      文档
  └── data/xxx      数据 / 灌数相关
```

### 6.2 Commit Message（中文 Conventional Commits）

```
<type>: <subject>

<body 可选，详细说明动机 / 改动 / 影响>
```

| type | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 舆图新增北宋开宝八年疆域帧` |
| `fix` | Bug 修复 | `fix: 修复单字搜索 LIKE 兜底大小写不敏感问题` |
| `refactor` | 重构 | `refactor: 抽离 index.ts 的大段搜索逻辑到 routes/search.ts` |
| `perf` | 性能 | `perf: 人物列表 KV TTL 从 5min 提至 30min，95 线降 120ms` |
| `style` | UI / 样式 | `style: 调整朝代卡片 hover 阴影与过渡时长` |
| `docs` | 文档 | `docs: 补充本地 Turso dev 灌数步骤到 CONTRIBUTING` |
| `test` | 测试 | `test: 为 db.ts 适配器新增 first() / run() Vitest 用例` |
| `chore` | 构建 / 依赖 / 工具 | `chore: 升级 3d-force-graph 到 1.80` |
| `data` | 数据灌数 | `data: 补灌《汉书》卷 50-60 的 bigram FTS 索引` |

### 6.3 PR 流程

#### PR 前自查清单（PR 描述中勾选）

- [ ] 本地运行 `npm run check` 全通过
- [ ] 本地运行 `npm run lint` 无新增报错
- [ ] 改了 `wrangler.json` bindings → 已执行 `npm run cf-typegen`
- [ ] 改了 Worker API 返回结构 → `src/worker/types.ts` 和 `src/react-app/data/types.ts` **两边同步**
- [ ] 改了 D1 USER_DB 表结构 → 已新建 `migrations/NNNN_xxx.sql` 并本地 `--local` 验证
- [ ] 改了 `toBigrams()` → 已同步 `scripts/` 灌数管线中同名单字切词逻辑
- [ ] 所有 `KV.put` 包了 `c.executionCtx.waitUntil(...)`
- [ ] 所有前端 fetch 带了 `credentials: 'include'`
- [ ] 若改动 auth / Cookie / JWT → 已在本地零账号模式下跑通注册/登录/登出/刷新全流程

#### PR 标题

同 commit message：`type: 中文描述`，例 `feat: 舆图新增南宋疆域帧`

#### PR 描述模板

```markdown
## 变更类型
- [ ] feat 新功能
- [ ] fix Bug 修复
- [ ] refactor 重构
- [ ] perf 性能
- [ ] style 样式
- [ ] docs 文档
- [ ] test 测试
- [ ] data 数据
- [ ] chore 其他

## 改动内容（分点列出）
- 新增了 /api/xxx 接口，返回 yyy
- 修改了 toBigrams 对全角空格的处理，已同步灌数管线
- ...

## 关联 Issue / PR
Closes #123
同域子站同步 PR（如有）：<link>

## 性能数据（perf 类 PR 必须）
- 搜索接口 p50：120ms → 80ms（降 33%）
- 首屏 LCP：2.1s → 1.6s（webp 首图）
- （可贴浏览器 DevTools Performance / Lighthouse 截图）

## 测试步骤
1. 登录 / 游客两种身份
2. 访问 /atlas，时间轴拖到 960 年，确认北宋疆域图层加载
3. 搜索「王安石」返回列传原文，高亮正确
4. 切换简体 / 繁体不报错

## 风险 / 注意事项
- ⚠ 本 PR 改了 JWT Cookie 相关逻辑，需通知 owner 部署时做同域跨站联调
- 本 PR 新增了 work_saves 字段，老存档兼容，不影响已有用户
```

#### Code Review & 合并

- 至少 1 个 approver；改 auth / DB schema / 部署配置需要 owner approve
- 所有 review comment resolved 后 merge
- 合并方式：**Squash Merge**（main 历史干净）

### 6.4 Issue 模板

**Bug 报告**：

```markdown
## 环境
- 线上 timeslip.work 还是本地 dev？
- 浏览器 + 版本：Chrome 126 / Safari 17 等
- 登录状态：游客 / 已登录

## 复现步骤
1. 打开什么页面
2. 做了什么操作（滚动 / 点击 / 输入什么搜索词）
3. ...

## 预期
应该发生什么

## 实际
发生了什么（完整错误栈 + Console 截图 + Network 请求/响应）

## 最小复现
能给个 curl 或最小代码片段吗？
```

**功能建议**：

```markdown
## 背景 / 痛点
为什么需要这个功能？解决什么问题？

## 期望方案
（可选）你希望怎么实现 / UI 长什么样

## 参考截图 / 链接
（可选）竞品、PRD、原型
```

### 6.5 给 AI 的 Prompt 模板（发给 AI 快速开发）

把本文件 + 以下模板一起发给 AI：

```
你是 timslip-work（穿越兰台主站）项目的资深开发者。请先完整阅读本 CONTRIBUTING.md 和项目的 CLAUDE.md、AGENTS.md，再执行以下任务：

## 任务描述
<具体任务，例如："给《新五代史》的人物加立绘资产，接入 ASSETS_BUCKET，在人物详情页按风格切换显示，并加缓存版本号 v1">

## 约束（必读，违反会导致生产事故）
1. 严格遵守本文档中的架构约定：
   - KV.put 必须 c.executionCtx.waitUntil(...)
   - 前端 fetch 必须 credentials: 'include'
   - 改后端 API 返回结构时，worker/types.ts 和 react-app/data/types.ts 两边同步
   - 认证中间件 Cookie 优先于 Header
   - 存档表只用 work_saves，不要改动 / 写入其他存档表
2. 改 wrangler.json 绑定后，提醒我跑 npm run cf-typegen
3. 改 D1 schema 时，新建 migrations/NNNN_xxx.sql 并给本地+线上执行命令
4. 改 JWT / Cookie / auth 相关时，说明是否需要通知 owner 做同域跨站联调
5. 改 toBigrams() 时，提醒 scripts/ 灌数管线也要同步
6. 完成后跑 npm run check 通过

## 交付物
1. 改动文件清单 + 每个文件的修改点
2. 自测步骤（按步骤能在浏览器验证）
3. 风险点 / 需要手动执行的命令（迁移、变量设置等）
4. 部署顺序说明（是否先迁库、是否需要通知 owner 联调）
```

---

## 七、部署

### 7.1 常规部署

```bash
# 0. 本地检查
npm run check

# 1. 部署（内部会先 build，再 wrangler deploy）
npm run deploy
```

成功输出示例：
```
Latest deployment created: https://timslip-work.winniringy.workers.dev
Current version: xxxxxxxx (published)
```

生产 DNS 已把 `timeslip.work` 做 CNAME 到这个 workers.dev 域名。

### 7.2 Worker 环境变量

**公开 vars**（非敏感，写在 `wrangler.json`）：
```jsonc
"vars": {
  "TURSO_DATABASE_URL": "libsql://timslip-db-johnfire.aws-ap-northeast-1.turso.io"
}
```

**Secrets（敏感，命令行注入，别写 git）**：
```bash
# 生产 JWT_SECRET
wrangler secret put JWT_SECRET
# → 粘贴长随机字符串（同域子站若有同样认证，通知 owner 保证密钥一致）

# Turso 写 token（读写权限）
wrangler secret put TURSO_AUTH_TOKEN
# → 粘贴 turso db tokens create timslip-db 输出的 token
```

查看当前 secrets：
```bash
wrangler secret list
```

### 7.3 部署顺序

| 场景 | 顺序 | 验证步骤 |
|------|------|----------|
| **常规独立改动**（加 UI、加搜索字段、舆图帧、调 Canvas） | 直接 `npm run deploy` | 打开 timeslip.work 冒烟测试 5 分钟 |
| **D1 USER_DB 迁移**（加字段 / 建索引） | 1. 本地跑 `wrangler d1 migrations apply timeslip-shiji-users --local` 通过<br>2. 线上迁库：`wrangler d1 migrations apply timeslip-shiji-users --remote`<br>3. `npm run deploy` 部署代码 | 测试账号注册 / 登录 / 读写存档 |
| **JWT / Auth / Cookie 改动** | 1. 合 PR 前通知 owner 跨站联调计划<br>2. `npm run deploy`<br>3. owner 同步同域子站部署 | 登录态不丢，刷新仍保持登录 |
| **JWT_SECRET 轮换** | 1. `wrangler secret put JWT_SECRET` 设新值<br>2. 通知同域子站一起设新值<br>3. 两站点同时 `deploy` | 老用户会被登出，用新凭证重登即可 |
| **KV key 版本升级**（结构大改） | 代码 bump key prefix（v6→v7）→ `npm run deploy` | 无需手动清 KV，自然失效 |
| **Turso 灌数** | 1. 先灌 staging / 测试库验证<br>2. 业务低峰期灌线上（49498 条分批） | 搜索 / 阅读抽样 50 条验证 |

### 7.4 线上排障

```bash
# 实时日志（最常用）
npx wrangler tail
# 加过滤：只看 5xx
npx wrangler tail --format json | jq 'select(.level == "error")'

# 看最近 10 次部署
wrangler deployments list

# 回滚到上一版
wrangler rollback <deployment-id>

# 手动验证 API
curl -I https://timeslip.work/api/health
curl "https://timeslip.work/api/search?q=秦始皇" -H "Origin: https://timeslip.work"
```
