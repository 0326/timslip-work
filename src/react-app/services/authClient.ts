import type {
	UserInfo,
	LoginResponse,
	ApiError,
	WorkSaveData,
	SaveResponse,
	SaveConflictError,
} from "../types/auth";

const API_BASE = "/api";

async function request<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
		},
		credentials: "include",
	});

	if (!res.ok) {
		let errData: ApiError;
		try {
			errData = await res.json();
		} catch {
			errData = { error: `http_${res.status}`, message: res.statusText };
		}
		if (res.status === 409 && errData.error === "conflict") {
			throw errData as SaveConflictError;
		}
		throw errData;
	}

	if (res.status === 204) return undefined as T;
	return res.json();
}

export async function register(
	username: string,
	password: string,
	nickname?: string,
): Promise<LoginResponse> {
	return request<LoginResponse>("/auth/register", {
		method: "POST",
		body: JSON.stringify({ username, password, nickname }),
	});
}

export async function login(
	username: string,
	password: string,
): Promise<LoginResponse> {
	return request<LoginResponse>("/auth/login", {
		method: "POST",
		body: JSON.stringify({ username, password }),
	});
}

export async function logout(): Promise<{ ok: true }> {
	return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<UserInfo> {
	return request<UserInfo>("/user/me");
}

export async function checkUsername(username: string): Promise<{ valid: boolean; available: boolean; message?: string }> {
	return request<{ valid: boolean; available: boolean; message?: string }>(
		`/auth/check-username?username=${encodeURIComponent(username)}`,
	);
}

export async function getSave(slot = "default"): Promise<SaveResponse> {
	return request<SaveResponse>(`/user/save?slot=${encodeURIComponent(slot)}`);
}

export async function putSave(
	save: WorkSaveData,
	clientUpdatedAt: number,
	slot = "default",
	expectedVersion?: number,
): Promise<{ ok: true; version: number; updatedAt: number }> {
	return request("/user/save" + (slot !== "default" ? `?slot=${encodeURIComponent(slot)}` : ""), {
		method: "PUT",
		body: JSON.stringify({ save, clientUpdatedAt, expectedVersion }),
	});
}

/**
 * 字段级增量写回：只合并指定顶层字段（如 highlights），避免整档往返。
 * @param fields 需要合并的顶层字段子集
 */
export async function patchSave(
	fields: Partial<WorkSaveData>,
	clientUpdatedAt: number,
	slot = "default",
	expectedVersion?: number,
): Promise<{ ok: true; version: number; updatedAt: number }> {
	return request("/user/save" + (slot !== "default" ? `?slot=${encodeURIComponent(slot)}` : ""), {
		method: "PATCH",
		body: JSON.stringify({ fields, clientUpdatedAt, expectedVersion }),
	});
}

export async function deleteSave(slot = "default"): Promise<{ ok: true }> {
	return request(`/user/save?slot=${encodeURIComponent(slot)}`, { method: "DELETE" });
}

export async function updateNickname(nickname: string): Promise<{ ok: true; nickname: string }> {
	return request("/user/me", {
		method: "PATCH",
		body: JSON.stringify({ nickname }),
	});
}
