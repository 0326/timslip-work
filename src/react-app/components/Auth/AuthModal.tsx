import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { LogIn, UserPlus, Cloud, CloudOff, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../store/authStore";
import "./auth.css";

interface AuthModalProps {
	open: boolean;
	onClose: () => void;
	initialMode?: "login" | "register";
}

export default function AuthModal({ open, onClose, initialMode = "login" }: AuthModalProps) {
	const { login, register } = useAuth();
	const [mode, setMode] = useState<"login" | "register">(initialMode);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [nickname, setNickname] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPwd, setShowPwd] = useState(false);
	const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
	const [usernameMsg, setUsernameMsg] = useState("");

	const reset = useCallback(() => {
		setUsername("");
		setPassword("");
		setNickname("");
		setError("");
		setShowPwd(false);
		setUsernameStatus("idle");
		setUsernameMsg("");
	}, []);

	useEffect(() => {
		if (open) {
			setMode(initialMode);
			reset();
		}
	}, [open, initialMode, reset]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	useEffect(() => {
		if (mode !== "register" || !username) {
			setUsernameStatus("idle");
			setUsernameMsg("");
			return;
		}
		if (username.length < 2) {
			setUsernameStatus("invalid");
			setUsernameMsg("用户名至少 2 个字符");
			return;
		}
		if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
			setUsernameStatus("invalid");
			setUsernameMsg("只能包含字母、数字、下划线或中文");
			return;
		}
		setUsernameStatus("checking");
		setUsernameMsg("检查中...");
		const t = setTimeout(async () => {
			try {
				const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`, { credentials: "include" });
				const data = await res.json();
				if (data.valid && data.available) {
					setUsernameStatus("available");
					setUsernameMsg("用户名可用");
				} else {
					setUsernameStatus("taken");
					setUsernameMsg(data.message || "该用户名已被使用");
				}
			} catch {
				setUsernameStatus("idle");
				setUsernameMsg("");
			}
		}, 500);
		return () => clearTimeout(t);
	}, [username, mode]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		if (!username || !password) {
			setError("请填写用户名和密码");
			return;
		}
		if (password.length < 6) {
			setError("密码至少 6 位");
			return;
		}
		setLoading(true);
		let result: { success: boolean; message?: string };
		if (mode === "login") {
			result = await login(username, password);
		} else {
			if (usernameStatus === "taken" || usernameStatus === "invalid") {
				setError(usernameMsg || "用户名无效");
				setLoading(false);
				return;
			}
			result = await register(username, password, nickname || username);
		}
		setLoading(false);
		if (result.success) {
			onClose();
		} else {
			setError(result.message || "操作失败");
		}
	};

	const switchMode = (newMode: "login" | "register") => {
		setMode(newMode);
		setError("");
		setShowPwd(false);
	};

	if (!open) return null;

	return createPortal(
		<div className="auth-overlay" onClick={onClose}>
			<div className="auth-dialog" onClick={(e) => e.stopPropagation()}>
				<div className="auth-ornament">
					<span className="auth-ornament-line" />
					<span className="auth-ornament-dot" />
					<span className="auth-ornament-line" />
				</div>

				<div className="auth-header">
					<h2>{mode === "login" ? "登录" : "注册"}</h2>
					<p className="auth-subtitle">
						<Cloud size={13} />
						{mode === "login" ? "登录后游戏进度可云端同步" : "创建账号，保存你的穿越之旅"}
					</p>
				</div>

				<div className="auth-tabs">
					<button
						className={`auth-tab ${mode === "login" ? "active" : ""}`}
						onClick={() => switchMode("login")}
						type="button"
					>
						<LogIn size={15} />
						登录
					</button>
					<button
						className={`auth-tab ${mode === "register" ? "active" : ""}`}
						onClick={() => switchMode("register")}
						type="button"
					>
						<UserPlus size={15} />
						注册
					</button>
				</div>

				<form className="auth-form" onSubmit={handleSubmit}>
					<div className="auth-field">
						<label className="auth-label">用户名</label>
						<div className="auth-input-wrap">
							<input
								type="text"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder="输入用户名"
								autoComplete="username"
								maxLength={20}
								className={usernameStatus === "available" ? "valid" : usernameStatus === "taken" || usernameStatus === "invalid" ? "invalid" : ""}
								disabled={loading}
							/>
							{mode === "register" && usernameStatus === "available" && (
								<span className="auth-input-check ok">✓</span>
							)}
						</div>
						{mode === "register" && usernameStatus !== "idle" && (
							<span className={`auth-hint ${usernameStatus}`}>
								{usernameMsg}
							</span>
						)}
					</div>

					{mode === "register" && (
						<div className="auth-field">
							<label className="auth-label">昵称 <span className="auth-optional">选填</span></label>
							<input
								type="text"
								value={nickname}
								onChange={(e) => setNickname(e.target.value)}
								placeholder="默认与用户名相同"
								maxLength={20}
								disabled={loading}
							/>
						</div>
					)}

					<div className="auth-field">
						<label className="auth-label">密码</label>
						<div className="auth-input-wrap">
							<input
								type={showPwd ? "text" : "password"}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="至少 6 位"
								autoComplete={mode === "login" ? "current-password" : "new-password"}
								maxLength={64}
								disabled={loading}
							/>
							<button
								type="button"
								className="auth-input-toggle"
								onClick={() => setShowPwd(!showPwd)}
								tabIndex={-1}
								aria-label={showPwd ? "隐藏密码" : "显示密码"}
							>
								{showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
							</button>
						</div>
					</div>

					{error && (
						<div className="auth-error">
							<CloudOff size={14} />
							{error}
						</div>
					)}

					<button type="submit" className="auth-submit" disabled={loading}>
						{loading ? (
							<span className="auth-loading-text">
								<span className="auth-spinner" />
								请稍候
							</span>
						) : mode === "login" ? "登 录" : "注册并开始"}
					</button>

					<div className="auth-footer">
						{mode === "login" ? (
							<span className="auth-switch">
								还没有账号？
								<button type="button" onClick={() => switchMode("register")}>立即注册</button>
							</span>
						) : (
							<span className="auth-switch">
								已有账号？
								<button type="button" onClick={() => switchMode("login")}>去登录</button>
							</span>
						)}
					</div>
				</form>
			</div>
		</div>,
		document.body,
	);
}
