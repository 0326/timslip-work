export interface UserInfo {
	id: string;
	username: string;
	nickname: string;
	createdAt: number;
	lastLoginAt: number;
	avatarUrl: string | null;
}

export interface LoginResponse {
	token: string;
	user: UserInfo;
}

export interface ApiError {
	error: string;
	message?: string;
}

export interface WorkSaveData {
	favorites?: string[];
	readingProgress?: Record<string, unknown>;
	lastVisited?: string;
	[key: string]: unknown;
}

export interface SaveResponse {
	exists: boolean;
	save?: WorkSaveData;
	updatedAt?: number;
	clientUpdatedAt?: number;
	version?: number;
}

export interface SaveConflictError {
	error: "conflict";
	message: string;
	serverSave: WorkSaveData | null;
	serverVersion: number | null;
	serverClientUpdatedAt: number | null;
}
