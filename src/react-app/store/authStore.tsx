import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	type ReactNode,
} from "react";
import {
	register as apiRegister,
	login as apiLogin,
	logout as apiLogout,
	getMe,
} from "../services/authClient";
import type { UserInfo } from "../types/auth";

interface AuthContextValue {
	user: UserInfo | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
	register: (
		username: string,
		password: string,
		nickname?: string,
	) => Promise<{ success: boolean; message?: string }>;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	setUser: (user: UserInfo | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<UserInfo | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const init = useCallback(async () => {
		try {
			const me = await getMe();
			setUser(me);
		} catch {
			setUser(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		init();
	}, [init]);

	const login = useCallback(async (username: string, password: string) => {
		try {
			const res = await apiLogin(username, password);
			setUser(res.user);
			return { success: true };
		} catch (err) {
			const e = err as { message?: string };
			return { success: false, message: e.message ?? "登录失败" };
		}
	}, []);

	const register = useCallback(
		async (username: string, password: string, nickname?: string) => {
			try {
				const res = await apiRegister(username, password, nickname);
				setUser(res.user);
				return { success: true };
			} catch (err) {
				const e = err as { message?: string };
				return { success: false, message: e.message ?? "注册失败" };
			}
		},
		[],
	);

	const logout = useCallback(async () => {
		try {
			await apiLogout();
		} catch {
			// ignore
		}
		setUser(null);
	}, []);

	const refreshUser = useCallback(async () => {
		try {
			const me = await getMe();
			setUser(me);
		} catch {
			setUser(null);
		}
	}, []);

	return (
		<AuthContext.Provider
			value={{
				user,
				isAuthenticated: !!user,
				isLoading,
				login,
				register,
				logout,
				refreshUser,
				setUser,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
