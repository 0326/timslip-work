import type { Context, Next } from "hono";
import { extractTokenFromCookie, extractTokenFromHeader, verifyJwt, type JwtPayload } from "../lib/crypto";

export interface AuthEnv {
	Variables: {
		user: JwtPayload;
	};
	Bindings: Env;
}

export async function requireAuth(c: Context<AuthEnv>, next: Next) {
	if (!c.env.JWT_SECRET || !c.env.USER_DB) {
		return c.json({ error: "auth_not_configured" }, 503);
	}
	const cookieHeader = c.req.header("Cookie");
	const authHeader = c.req.header("Authorization");
	const token = extractTokenFromCookie(cookieHeader) ?? extractTokenFromHeader(authHeader);
	if (!token) {
		return c.json({ error: "unauthorized", message: "请先登录" }, 401);
	}
	const payload = await verifyJwt(token, c.env.JWT_SECRET);
	if (!payload) {
		return c.json({ error: "invalid_token", message: "登录已过期，请重新登录" }, 401);
	}
	c.set("user", payload);
	await next();
}

export async function optionalAuth(c: Context<AuthEnv>, next: Next) {
	if (!c.env.JWT_SECRET) {
		await next();
		return;
	}
	const cookieHeader = c.req.header("Cookie");
	const authHeader = c.req.header("Authorization");
	const token = extractTokenFromCookie(cookieHeader) ?? extractTokenFromHeader(authHeader);
	if (token) {
		const payload = await verifyJwt(token, c.env.JWT_SECRET);
		if (payload) c.set("user", payload);
	}
	await next();
}
