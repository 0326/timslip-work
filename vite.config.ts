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
                    // 地图库（仅舆图页面使用，不依赖 React，可独立拆分）
                    if (id.includes('node_modules/maplibre-gl')) {
                        return 'vendor-maplibre';
                    }
                    // 3D 图谱库（仅人物关系图谱使用，不依赖 React，可独立拆分）
                    if (id.includes('node_modules/three') || id.includes('node_modules/3d-force-graph') || id.includes('node_modules/d3-force')) {
                        return 'vendor-three';
                    }
                    // 其余 node_modules 统一打包为一个 vendor chunk。
                    // React / react-dom / react-router / framer-motion / lucide-react 等存在
                    // 互相依赖关系，拆开会导致加载顺序不可控（如 createContext 在 React 之前执行）。
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                },
            },
        },
    },
});