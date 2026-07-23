// 共享类型定义
// 依据: docs/API_SPEC.md §7

export interface Gloss {
  term: string;
  text: string;
}

export interface Passage {
  id: string;
  chapter_id: string;
  section_id: string | null;
  content: string;
  annotation: string | null;
  glosses: Gloss[] | null;
  vernacular: string | null;
  order_idx: number;
  version: number;
}

export interface Book {
  id: string;
  name: string;
  author: string;
  dynasty: string;
  volume_count: number;
  type: string;
  status: 'active' | 'planned';
  sort_order: number;
  description?: string;
  /** 已导入入库的卷数（>0 表示该书原文已收录、可检索） */
  imported_volumes?: number;
}

export interface Volume {
  id: string;
  book_id: string;
  name: string;
  volume_no: number;
  category: string;
}

export interface Chapter {
  id: string;
  volume_id: string;
  name: string;
  subtitle?: string | null;
  intro?: string | null;
  sort_order?: number;
}

/** 目录页的一篇：篇章 join 卷元信息 + 段落数 */
export interface CatalogChapter {
  id: string;
  name: string;
  subtitle: string | null;
  sort_order: number | null;
  volume_no: number;
  category: string;
  volume_name: string;
  passage_count: number;
}

export interface BookCatalog {
  book: Book;
  chapters: CatalogChapter[];
}

/** 阅读页的一段：含白话/注释 */
export interface ChapterPassage {
  id: string;
  content: string;
  vernacular: string | null;
  annotation: string | null;
  order_idx: number;
  version: number;
}

/** 篇章详情：附书/卷上下文与前后篇导航 */
export interface ChapterDetail extends Chapter {
  book_id: string;
  book_name: string;
  volume_no: number;
  category: string;
  volume_name: string;
  passages: ChapterPassage[];
  prev: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
}

export interface Section {
  id: string;
  chapter_id: string;
  name: string;
  order_idx: number;
}

export interface Entity {
  id: string;
  name: string;
  type: 'person' | 'place' | 'office' | 'year';
  aliases: string[];
  birth_year: number | null;
  death_year: number | null;
  description: string;
  dynasty: string;
}

export interface Relation {
  id: number;
  source_id: string;
  target_id: string;
  type: string;
  start_year: number | null;
  end_year: number | null;
  passage_id: string;
  description: string;
  target_name?: string;
}

export interface Dynasty {
  id: string;
  name: string;
  start_year: number;
  end_year: number;
  book_ids: string[];
  book_label: string;
  img: string;
  description: string;
  is_active: boolean;
}

export interface TimelineEvent {
  id: number;
  year: number;
  dynasty_id: string;
  title: string;
  description: string;
  category: string;
}

export interface TimelineData {
  range: { start: number; end: number };
  dynasties: Dynasty[];
  events: TimelineEvent[];
}

export interface SearchResult {
  passage_id: string;
  book_id: string;
  book_name: string;
  chapter_name: string;
  snippet: string;
  highlight: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  page: number;
  limit: number;
  results: SearchResult[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface Figure {
  id: string;
  name: string;
  aliases: string[];
  birth_year: number | null;
  death_year: number | null;
  dynasty: string;
  identity: string;
  bio_summary: string;
  keyword_tags: string[];
  avatar_icon: string;
  avatar_url: string | null;
  /** R2 资产头像 URL（/api/asset/...）。列表接口 JOIN 得出，省去每卡单独拉 assets；无则 null。 */
  avatar: string | null;
  gender: "male" | "female" | "unknown";
  /** 综合等级 1–5 星（知名度×影响力×历史地位×贡献），见 docs/PRD_FIGURES_RANKING.md */
  star: number;
  src_book: string;
  src_juan: number | null;
  src_chapter: string | null;
}

export interface FigurePassage {
  passage_id: string;
  chapter_id: string;
  chapter_name: string;
  book_id: string;
  book_name: string;
  volume_no: number;
  title: string;
  content: string;
  year: number | null;
  location: string | null;
  order_idx: number;
}

export interface FigureRelation {
  target_id: string;
  target_name: string;
  target_identity: string;
  target_dynasty: string;
  relation_type: string;
  relation_label: string;
  description: string | null;
  passage_count: number;
}

export interface FigureDetail extends Figure {
  passages: FigurePassage[];
}

export interface FigureListResponse {
  total: number;
  page: number;
  limit: number;
  items: Figure[];
  filters: {
    dynasties: { value: string; count: number }[];
    identities: { value: string; count: number }[];
  };
}

// ===== 人物视觉资产模块 =====

export type AssetType =
  | 'avatar'
  | 'portrait-bust'
  | 'portrait-full'
  | 'background'
  | 'cg'
  | 'spine'
  | 'chibi'
  | 'expression'
  | 'extra';

export interface ArtStyle {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AssetFileMetadata {
  prompt?: string;
  negative_prompt?: string;
  emotion?: string;
  alt_zh?: string;
  alt_en?: string;
  source?: string;
  model_version?: string;
  recommended_crop?: {
    focus_x: number;
    focus_y: number;
  };
}

export interface AssetFile {
  id: string;
  asset_id: string;
  asset_type: AssetType;
  variant: string;
  r2_key: string;
  url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
  metadata: AssetFileMetadata | null;
  created_at: number;
}

export interface FigureAsset {
  id: string;
  figure_id: string;
  style_id: string;
  style_name?: string;
  is_default: boolean;
  creator: string | null;
  status: 'draft' | 'active' | 'archived';
  metadata: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
  files: AssetFile[];
}

export interface FigureWithAssets extends Figure {
  default_style?: string;
  assets?: Record<string, FigureAsset>;
}

// ─── 舆图模块（见 docs/PRD_ATLAS.md §5） ───

export interface AtlasSnapshotMeta {
  slug: string;
  label: string;
  /** 朝代段名（时间轴分段用） */
  group: string;
  year: number;
  year_label: string;
  blurb: string;
  books: string[];
  sort_order: number;
}

export interface AtlasCapitalMarker {
  name: string;
  lng: number;
  lat: number;
  regime: string;
}

export interface AtlasFigureMarker {
  name: string;
  lng: number;
  lat: number;
  place_name: string | null;
  note: string | null;
  // 联动 figures 表（命中则可深链 /figures/:id）
  figure_id: string | null;
  identity: string | null;
  avatar_icon: string | null;
  birth_year: number | null;
  death_year: number | null;
}

// 同期史册人物（按窗口自动从 figures 表检出，无坐标，面板列表展示）
export interface AtlasPeriodFigure {
  id: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  dynasty: string;
  identity: string;
  avatar_icon: string | null;
}

export interface AtlasSnapshotDetail {
  meta: AtlasSnapshotMeta;
  capitals: AtlasCapitalMarker[];
  figures: AtlasFigureMarker[];
  periodFigures: AtlasPeriodFigure[];
}

export interface AtlasIndexResponse {
  attribution: string;
  frames: AtlasSnapshotMeta[];
}
