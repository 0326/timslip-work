import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../store/authStore";
import "./auth.css";

type Mode = "login" | "register";

interface AuthModalProps {
	open: boolean;
	onClose: () => void;
	initialMode?: Mode;
}

export default function AuthModal({ open, onClose, initialMode = "login" }: AuthModalProps) {
	const { login, register } = useAuth();
	const [mode, setMode] = useState<Mode>(initialMode);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [nickname, setNickname] = useState("");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [showPwd, setShowPwd] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);
	const userInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setMode(initialMode);
			setError("");
			setUsername("");
			setPassword("");
			setNickname("");
			setShowPwd(false);
			setTimeout(() => userInputRef.current?.focus(), 100);
		}
	}, [open, initialMode]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		if (!username.trim() || !password) {
			setError("请填写用户名和密码");
			return;
		}
		setSubmitting(true);
		let result: { success: boolean; message?: string };
		if (mode === "login") {
			result = await login(username.trim(), password);
		} else {
			result = await register(username.trim(), password, nickname.trim() || username.trim());
		}
		setSubmitting(false);
		if (result.success) {
			onClose();
		} else {
			setError(result.message ?? (mode === "login" ? "登录失败" : "注册失败"));
		}
	};

	const switchMode = (m: Mode) => {
		setMode(m);
		setError("");
	};

	if (!open) return null;

	return (
		<div className="auth-overlay" onClick={onClose}>
			<div className="auth-dialog" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
				<div className="auth-header">
					<div className="auth-title">
						<span className="auth-seal">印</span>
						<span>{mode === "login" ? "登 录" : "注 册"}</span>
					</div>
					<button className="auth-close" onClick={onClose} aria-label="关闭">×</button>
				</div>

				<form className="auth-form" onSubmit={handleSubmit}>
					<div className="auth-field">
						<label>用户名</label>
						<input
							ref={userInputRef}
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="2-20 位，字母/数字/中文/下划线"
							autoComplete="username"
							maxLength={20}
							disabled={submitting}
						/>
					</div>

					{mode === "register" && (
						<div className="auth-field">
							<label>昵称 <span className="auth-optional">（可选）</span></label>
							<input
								type="text"
								value={nickname}
								onChange={(e) => setNickname(e.target.value)}
								placeholder="留空则与用户名相同"
								maxLength={20}
								disabled={submitting}
							/>
						</div>
					)}

					<div className="auth-field">
						<label>密码</label>
						<div className="auth-pwd-wrap">
							<input
								type={showPwd ? "text" : "password"}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="6-64 位"
								autoComplete={mode === "login" ? "current-password" : "new-password"}
								maxLength={64}
								disabled={submitting}
							/>
							<button
								type="button"
								className="auth-pwd-toggle"
								onClick={() => setShowPwd(!showPwd)}
								tabIndex={-1}
							>
								{showPwd ? "隐" : "显"}
							</button>
						</div>
					</div>

					{error && <div className="auth-error">{error}</div>}

					<button type="submit" className="auth-submit" disabled={submitting}>
						{submitting ? "…" : mode === "login" ? "入 册" : "立 籍"}
					</button>

					<div className="auth-switch">
						{mode === "login" ? (
							<>初入兰台？<button type="button" onClick={() => switchMode("register")}>注册新籍</button></>
						) : (
							<>已有户帖？<button type="button" onClick={() => switchMode("login")}>返回登录</button></>
						)}
					</div>
				</form>
			</div>
		</div>
	);
}
