import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import type { Plugin } from "vite";

// @cloudflare/vite-plugin 设置 appType: "custom"，导致 Vite 不自动处理 SPA fallback。
// 此插件在 Vite 内部中间件之前插入 SPA fallback，将前端路由改写为 /index.html。
// 配合 wrangler.json 的 run_worker_first: ["/api/*"]，非 API 请求不走 Worker。
function spaFallback(): Plugin {
	return {
		name: "spa-fallback",
		configureServer(server) {
			// 返回 post-hook，在 Vite 内部中间件安装后执行
			return () => {
				const handler = (req: any, _res: any, next: any) => {
					const url = (req.url || "").split("?")[0];
					// 跳过 API 请求、带文件扩展名的请求、HMR/debug 请求
					if (
						url.startsWith("/api/") ||
						url.includes(".") ||
						url.startsWith("/@") ||
						url.startsWith("/__debug") ||
						url === "/index.html"
					) {
						return next();
					}
					// 前端路由，改写为 /index.html 交给 Vite 处理
					req.url = "/index.html";
					next();
				};

				// 插入到 viteCachedTransformMiddleware 之前
				const stack = (server.middlewares as any).stack as any[];
				const idx = stack.findIndex(
					(m: any) =>
						"name" in m.handle &&
						m.handle.name === "viteCachedTransformMiddleware",
				);
				if (idx !== -1) {
					stack.splice(idx, 0, { route: "", handle: handler });
				} else {
					server.middlewares.use(handler);
				}
			};
		},
	};
}

export default defineConfig({
	// remoteBindings: 让本地 dev 中标了 "remote": true 的绑定（D1）直连线上数据库，
	// 而非本地 miniflare 空库。需已 wrangler login。KV 未标 remote，仍走本地缓存。
	plugins: [react(), spaFallback(), cloudflare({ remoteBindings: true })],
});
