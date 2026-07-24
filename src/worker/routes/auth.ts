import { Hono } from "hono";
import { hashPassword, verifyPassword, signJwt, setAuthCookie, clearAuthCookie, isLocalDev } from "../lib/crypto";

interface RegisterBody {
	username: string;
	password: string;
	nickname?: string;
}

interface LoginBody {
	username: string;
	password: string;
}

function genId(): string {
	return crypto.randomUUID();
}

function validateUsername(u: string): string | null {
	if (!u || u.length < 2 || u.length > 20) return "用户名长度需在 2-20 位之间";
	if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(u)) return "用户名只能包含字母、数字、下划线或中文";
	return null;
}

function validatePassword(p: string): string | null {
	if (!p || p.length < 6 || p.length > 64) return "密码长度需在 6-64 位之间";
	return null;
}

export const auth = new Hono<{ Bindings: Env }>();

auth.use("*", async (c, next) => {
	if (!c.env.USER_DB || !c.env.JWT_SECRET) {
		return c.json({ error: "auth_not_configured", message: "账号系统未配置" }, 503);
	}
	await next();
});

auth.post("/register", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as RegisterBody;
	const { username, password } = body;
	const nickname = body.nickname?.trim() || username;

	const uErr = validateUsername(username);
	if (uErr) return c.json({ error: "invalid_username", message: uErr }, 400);
	const pErr = validatePassword(password);
	if (pErr) return c.json({ error: "invalid_password", message: pErr }, 400);

	const existing = await c.env.USER_DB!.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
	if (existing) {
		return c.json({ error: "username_taken", message: "该用户名已被使用" }, 409);
	}

	const id = genId();
	const now = Date.now();
	const passwordHash = await hashPassword(password);

	await c.env.USER_DB!.prepare(
		"INSERT INTO users (id, username, password_hash, nickname, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)",
	)
		.bind(id, username, passwordHash, nickname, now, now)
		.run();

	const token = await signJwt({ sub: id, username }, c.env.JWT_SECRET!);
	const localDev = isLocalDev(new URL(c.req.url).hostname);

	return c.json({
		token,
		user: { id, username, nickname, createdAt: now },
	}, {
		headers: { "Set-Cookie": setAuthCookie(token, localDev) },
	});
});

auth.post("/login", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as LoginBody;
	const { username, password } = body;

	if (!username || !password) {
		return c.json({ error: "missing_fields", message: "请输入用户名和密码" }, 400);
	}

	const user = await c.env.USER_DB!.prepare("SELECT id, username, password_hash, nickname, created_at FROM users WHERE username = ?")
		.bind(username)
		.first<{ id: string; username: string; password_hash: string; nickname: string; created_at: number }>();

	if (!user) {
		return c.json({ error: "invalid_credentials", message: "用户名或密码错误" }, 401);
	}

	const ok = await verifyPassword(password, user.password_hash);
	if (!ok) {
		return c.json({ error: "invalid_credentials", message: "用户名或密码错误" }, 401);
	}

	await c.env.USER_DB!.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(Date.now(), user.id).run();

	const token = await signJwt({ sub: user.id, username: user.username }, c.env.JWT_SECRET!);
	const localDev = isLocalDev(new URL(c.req.url).hostname);

	return c.json({
		token,
		user: { id: user.id, username: user.username, nickname: user.nickname, createdAt: user.created_at },
	}, {
		headers: { "Set-Cookie": setAuthCookie(token, localDev) },
	});
});

auth.post("/logout", async (c) => {
	const localDev = isLocalDev(new URL(c.req.url).hostname);
	return c.json({ ok: true }, {
		headers: { "Set-Cookie": clearAuthCookie(localDev) },
	});
});

auth.get("/check-username", async (c) => {
	const username = c.req.query("username") ?? "";
	const uErr = validateUsername(username);
	if (uErr) return c.json({ valid: false, message: uErr });
	const existing = await c.env.USER_DB!.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
	return c.json({ valid: !existing, available: !existing });
});
