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

/** 单本史书的阅读进度记录 */
export interface ReadingProgressEntry {
	bookId: string;
	bookName: string;
	dynasty: string;
	author: string;
	volumeCount: number;
	/** 上次阅读的篇章 ID（跳转 /read/:chapterId） */
	chapterId: string;
	chapterName: string;
	volumeNo: number;
	/** 阅读百分比 0-100 */
	progress: number;
	/** 已读篇章数 */
	chaptersRead: number;
	/** 已读篇章 ID 列表（用于去重统计） */
	readChapterIds?: string[];
	/** 上次阅读时间戳 */
	lastReadAt: number;
}

/** 单条划线（读书笔记） */
export interface Highlight {
	/** 唯一 ID：`${bookId}-${chapterId}-${passageId}-${timestamp}` */
	id: string;
	bookId: string;
	bookName: string;
	chapterId: string;
	chapterName: string;
	volumeNo: number;
	passageId: string;
	/** 划线文本内容 */
	text: string;
	/** 创建时间戳 */
	createdAt: number;
}

export interface WorkSaveData {
	favorites?: string[];
	readingProgress?: Record<string, ReadingProgressEntry>;
	/** 划线笔记，按 bookId 分组 */
	highlights?: Record<string, Highlight[]>;
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
