import { useEffect, useState } from "react";
import AuthModal from "./AuthModal";
import {
	closeLoginModal,
	getAuthModalState,
	subscribeAuthModal,
} from "../../store/authModalStore";

/**
 * 全局登录弹窗控制器：订阅 authModalStore，
 * 在后端对受保护接口返回 401 等场景下自动弹出登录框。
 * 挂载于 App 根节点（AuthProvider 内），与 UserMenu 共用同一份弹窗状态。
 */
export default function AuthModalController() {
	const [state, setState] = useState(getAuthModalState());

	useEffect(
		() =>
			subscribeAuthModal(() => {
				setState(getAuthModalState());
			}),
		[],
	);

	return (
		<AuthModal
			open={state.open}
			onClose={closeLoginModal}
			initialMode={state.mode}
		/>
	);
}