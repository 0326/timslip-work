import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../store/authStore";
import { openLoginModal } from "../../store/authModalStore";
import "./auth.css";

export default function UserMenu() {
	const { user, isAuthenticated, isLoading, logout } = useAuth();
	const navigate = useNavigate();
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const openLogin = () => {
		openLoginModal("login");
		setMenuOpen(false);
	};

	const openRegister = () => {
		openLoginModal("register");
		setMenuOpen(false);
	};

	const handleLogout = async () => {
		await logout();
		setMenuOpen(false);
	};

	const goLibrary = (tab: "progress" | "notes" | "favorites") => {
		setMenuOpen(false);
		const qs = tab === "progress" ? "" : `?tab=${tab}`;
		navigate(`/library${qs}`);
	};

	if (isLoading) {
		return <div className="user-menu-placeholder" />;
	}

	if (!isAuthenticated) {
		return (
			<div className="auth-btns">
				<button className="auth-btn-login" onClick={openLogin}>登录</button>
				<button className="auth-btn-register" onClick={openRegister}>注册</button>
			</div>
		);
	}

	const initial = (user?.nickname || user?.username || "?").charAt(0).toUpperCase();

	return (
		<>
			<div className="user-menu" ref={menuRef}>
				<button
					className="user-avatar-btn"
					onClick={() => setMenuOpen(!menuOpen)}
					aria-label="用户菜单"
				>
					<span className="user-avatar-initial">{initial}</span>
				</button>

				{menuOpen && (
					<div className="user-dropdown">
						<div className="user-dropdown-header">
							<div className="user-dropdown-name">{user?.nickname}</div>
							<div className="user-dropdown-username">@{user?.username}</div>
						</div>
						<div className="user-dropdown-divider" />
						<button className="user-dropdown-item" onClick={() => goLibrary("progress")}>
					阅读进度
				</button>
				<button className="user-dropdown-item" onClick={() => goLibrary("notes")}>
				读书笔记
			</button>
				<button className="user-dropdown-item" onClick={() => goLibrary("favorites")}>
					我的收藏
				</button>
						<div className="user-dropdown-divider" />
						<button className="user-dropdown-item user-dropdown-logout" onClick={handleLogout}>
							退出登录
						</button>
					</div>
				)}
			</div>
		</>
	);
}
