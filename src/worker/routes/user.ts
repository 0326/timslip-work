import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../middleware/auth";

export interface WorkSaveData {
	favorites?: string[];
	readingProgress?: Record<string, unknown>;
	lastVisited?: string;
	[key: string]: unknown;
}

export const user = new Hono<AuthEnv>();

user.use("*", requireAuth);

user.get("/me", async (c) => {
	const payload = c.var.user;
	const row = await c.env.USER_DB!.prepare("SELECT id, username, nickname, created_at, last_login_at, avatar_url FROM users WHERE id = ?")
		.bind(payload.sub)
		.first<{ id: string; username: string; nickname: string; created_at: number; last_login_at: number; avatar_url: string | null }>();
	if (!row) return c.json({ error: "user_not_found" }, 404);
	return c.json({
		id: row.id,
		username: row.username,
		nickname: row.nickname,
		createdAt: row.created_at,
		lastLoginAt: row.last_login_at,
		avatarUrl: row.avatar_url,
	});
});

user.get("/save", async (c) => {
	const slot = c.req.query("slot") ?? "default";
	const userId = c.var.user.sub;
	const row = await c.env.USER_DB!.prepare("SELECT data, updated_at, client_updated_at, version FROM work_saves WHERE user_id = ? AND slot = ?")
		.bind(userId, slot)
		.first<{ data: string; updated_at: number; client_updated_at: number; version: number }>();
	if (!row) {
		return c.json({ exists: false });
	}
	let saveData: WorkSaveData;
	try {
		saveData = JSON.parse(row.data);
	} catch {
		return c.json({ error: "corrupted_save" }, 500);
	}
	return c.json({
		exists: true,
		save: saveData,
		updatedAt: row.updated_at,
		clientUpdatedAt: row.client_updated_at,
		version: row.version,
	});
});

interface SaveBody {
	save: WorkSaveData;
	clientUpdatedAt: number;
	slot?: string;
	expectedVersion?: number;
}

user.put("/save", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as SaveBody;
	if (!body.save || typeof body.clientUpdatedAt !== "number") {
		return c.json({ error: "bad_request", message: "缺少存档数据" }, 400);
	}
	const slot = body.slot ?? "default";
	const userId = c.var.user.sub;
	const now = Date.now();
	const dataStr = JSON.stringify(body.save);

	const existing = await c.env.USER_DB!.prepare("SELECT version FROM work_saves WHERE user_id = ? AND slot = ?")
		.bind(userId, slot)
		.first<{ version: number }>();

	if (existing) {
		if (body.expectedVersion !== undefined && existing.version !== body.expectedVersion) {
			const currentRow = await c.env.USER_DB!.prepare("SELECT data, updated_at, client_updated_at, version FROM work_saves WHERE user_id = ? AND slot = ?")
				.bind(userId, slot)
				.first<{ data: string; updated_at: number; client_updated_at: number; version: number }>();
			return c.json({
				error: "conflict",
				message: "云端存档已更新，请先同步",
				serverSave: currentRow ? JSON.parse(currentRow.data) : null,
				serverVersion: currentRow?.version,
				serverClientUpdatedAt: currentRow?.client_updated_at,
			}, 409);
		}
		const newVersion = existing.version + 1;
		await c.env.USER_DB!.prepare(
			"UPDATE work_saves SET data = ?, updated_at = ?, client_updated_at = ?, version = ? WHERE user_id = ? AND slot = ?",
		)
			.bind(dataStr, now, body.clientUpdatedAt, newVersion, userId, slot)
			.run();
		return c.json({ ok: true, version: newVersion, updatedAt: now });
	} else {
		await c.env.USER_DB!.prepare(
			"INSERT INTO work_saves (user_id, slot, data, updated_at, client_updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
		)
			.bind(userId, slot, dataStr, now, body.clientUpdatedAt)
			.run();
		return c.json({ ok: true, version: 1, updatedAt: now });
	}
});

user.delete("/save", async (c) => {
	const slot = c.req.query("slot") ?? "default";
	const userId = c.var.user.sub;
	await c.env.USER_DB!.prepare("DELETE FROM work_saves WHERE user_id = ? AND slot = ?").bind(userId, slot).run();
	return c.json({ ok: true });
});

/**
 * 字段级增量写回：只合并前端传入的顶层字段，避免整档 JSON 往返。
 * 用于划线笔记等高频、字段独立的写操作，从根本上消除「后写覆盖先写」的写放大。
 */
user.patch("/save", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as {
		fields?: Partial<WorkSaveData>;
		clientUpdatedAt?: number;
		slot?: string;
		expectedVersion?: number;
	};
	const fields = body.fields;
	if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length === 0) {
		return c.json({ error: "bad_request", message: "缺少待合并字段" }, 400);
	}
	const slot = body.slot ?? "default";
	const userId = c.var.user.sub;
	const now = Date.now();

	const existing = await c.env.USER_DB!.prepare("SELECT data, version FROM work_saves WHERE user_id = ? AND slot = ?")
		.bind(userId, slot)
		.first<{ data: string; version: number }>();

	if (existing) {
		if (body.expectedVersion !== undefined && existing.version !== body.expectedVersion) {
			return c.json({ error: "conflict", message: "云端存档已更新，请先同步", serverVersion: existing.version }, 409);
		}
		let current: WorkSaveData;
		try {
			current = JSON.parse(existing.data);
		} catch {
			current = {};
		}
		const merged: WorkSaveData = { ...current, ...fields };
		const newVersion = existing.version + 1;
		await c.env.USER_DB!.prepare(
			"UPDATE work_saves SET data = ?, updated_at = ?, client_updated_at = ?, version = ? WHERE user_id = ? AND slot = ?",
		)
			.bind(JSON.stringify(merged), now, body.clientUpdatedAt ?? now, newVersion, userId, slot)
			.run();
		return c.json({ ok: true, version: newVersion, updatedAt: now });
	} else {
		await c.env.USER_DB!.prepare(
			"INSERT INTO work_saves (user_id, slot, data, updated_at, client_updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
		)
			.bind(userId, slot, JSON.stringify(fields), now, body.clientUpdatedAt ?? now)
			.run();
		return c.json({ ok: true, version: 1, updatedAt: now });
	}
});

user.patch("/me", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { nickname?: string };
	const nickname = body.nickname?.trim();
	if (!nickname || nickname.length < 1 || nickname.length > 20) {
		return c.json({ error: "invalid_nickname", message: "昵称长度需在 1-20 位之间" }, 400);
	}
	await c.env.USER_DB!.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(nickname, c.var.user.sub).run();
	return c.json({ ok: true, nickname });
});
