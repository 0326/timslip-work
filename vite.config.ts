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
});