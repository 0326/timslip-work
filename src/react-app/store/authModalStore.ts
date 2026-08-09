/**
 * 全局登录弹窗控制 —— 模块级单例
 *
 * 当已登录会话过期、后端对受保护接口返回 401 时，任意业务代码（含非 React 模块，
 * 如 authClient）可通过 openLoginModal() 触发全局登录弹窗，无需在调用方维护 modal 状态。
 * UserMenu 与 AuthModalController 共用同一份弹窗状态，避免重复实例。
 */

type AuthModalMode = "login" | "register";

interface AuthModalState {
	open: boolean;
	mode: AuthModalMode;
}

let state: AuthModalState = { open: false, mode: "login" };
const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((fn) => fn());
}

/** 打开登录弹窗（已打开且同模式时幂等，避免重复触发） */
export function openLoginModal(mode: AuthModalMode = "login") {
	if (!state.open || state.mode !== mode) {
		state = { open: true, mode };
		emit();
	}
}

/** 关闭登录弹窗 */
export function closeLoginModal() {
	if (state.open) {
		state = { ...state, open: false };
		emit();
	}
}

export function getAuthModalState(): AuthModalState {
	return state;
}

/** 订阅弹窗状态变化，返回取消订阅函数 */
export function subscribeAuthModal(fn: () => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}