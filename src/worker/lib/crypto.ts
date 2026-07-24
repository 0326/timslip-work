const ITERATIONS = 100000;
const KEY_LEN = 32;
const SALT_LEN = 16;

function bufToHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex: string): ArrayBuffer {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes.buffer;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	const derived = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
		keyMaterial,
		KEY_LEN * 8,
	);
	return `${bufToHex(salt.buffer)}$${bufToHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [saltHex, hashHex] = stored.split("$");
	if (!saltHex || !hashHex) return false;
	const salt = hexToBuf(saltHex);
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	const derived = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
		keyMaterial,
		KEY_LEN * 8,
	);
	return bufToHex(derived) === hashHex;
}

function base64UrlEncode(buf: ArrayBuffer | string): string {
	const data = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
	let str = "";
	for (let i = 0; i < data.length; i++) str += String.fromCharCode(data[i]);
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): string {
	str = str.replace(/-/g, "+").replace(/_/g, "/");
	while (str.length % 4) str += "=";
	return atob(str);
}

export interface JwtPayload {
	sub: string;
	username: string;
	iat: number;
	exp: number;
}

export async function signJwt(payload: Omit<JwtPayload, "iat" | "exp">, secret: string, expiresInSec = 30 * 24 * 3600): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const full: JwtPayload = { ...payload, iat: now, exp: now + expiresInSec };
	const header = { alg: "HS256", typ: "JWT" };
	const h = base64UrlEncode(JSON.stringify(header));
	const p = base64UrlEncode(JSON.stringify(full));
	const signingInput = `${h}.${p}`;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
	return `${signingInput}.${base64UrlEncode(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
	try {
		const [h, p, s] = token.split(".");
		if (!h || !p || !s) return null;
		const signingInput = `${h}.${p}`;
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
		const sigBytes = new Uint8Array(
			Array.from(base64UrlDecode(s)).map((c) => c.charCodeAt(0)),
		);
		const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(signingInput));
		if (!valid) return null;
		const payload = JSON.parse(base64UrlDecode(p)) as JwtPayload;
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;
		return payload;
	} catch {
		return null;
	}
}

export function extractTokenFromCookie(cookieHeader: string | undefined): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

export function extractTokenFromHeader(auth: string | undefined): string | null {
	if (!auth) return null;
	const m = auth.match(/^Bearer\s+(.+)$/i);
	return m ? m[1] : null;
}

export function setAuthCookie(token: string, isLocalDev: boolean): string {
	const maxAge = 30 * 24 * 3600;
	const parts = [
		`auth_token=${encodeURIComponent(token)}`,
		`Max-Age=${maxAge}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
	];
	if (!isLocalDev) {
		parts.push("Secure");
		parts.push("Domain=.timeslip.work");
	}
	return parts.join("; ");
}

export function clearAuthCookie(isLocalDev: boolean): string {
	const parts = [
		"auth_token=",
		"Max-Age=0",
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
	];
	if (!isLocalDev) {
		parts.push("Secure");
		parts.push("Domain=.timeslip.work");
	}
	return parts.join("; ");
}

export function isLocalDev(hostname: string): boolean {
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".workers.dev");
}
