import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import type { Plugin } from "vite";

function spaFallback(): Plugin {
    return {
        name: "spa-fallback",
        configureServer(server) {
            return () => {
                const handler = (req: any, _res: any, next: any) => {
                    const url = (req.url || "").split("?")[0];
                    if (
                        url.startsWith("/api/") ||
                        url.includes(".") ||
                        url.startsWith("/@") ||
                        url.startsWith("/__debug") ||
                        url === "/index.html"
                    ) {
                        return next();
                    }
                    req.url = "/index.html";
                    next();
                };

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
    plugins: [react(), spaFallback(), cloudflare({ remoteBindings: true })],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // React 核心包
                    if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
                        return 'vendor-react';
                    }
                    // 地图库（仅舆图页面使用）
                    if (id.includes('node_modules/maplibre-gl')) {
                        return 'vendor-maplibre';
                    }
                    // 3D 图谱库（仅人物关系图谱使用）
                    if (id.includes('node_modules/three') || id.includes('node_modules/3d-force-graph') || id.includes('node_modules/d3-force')) {
                        return 'vendor-three';
                    }
                    // 动效库（全站使用但体量大）
                    if (id.includes('node_modules/framer-motion')) {
                        return 'vendor-framer';
                    }
                    // 其他 node_modules 依赖统一打包
                    if (id.includes('node_modules')) {
                        return 'vendor-other';
                    }
                },
            },
        },
    },
});