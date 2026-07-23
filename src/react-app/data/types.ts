// 本地引用（下方 FigureAssetsResponse / ArtStylesResponse 用到，纯 re-export 不进作用域）
import type { ArtStyle, FigureAsset } from "../../worker/types";

export type {
  Gloss,
  Passage,
  Book,
  Volume,
  Chapter,
  CatalogChapter,
  BookCatalog,
  ChapterPassage,
  ChapterDetail,
  Section,
  Entity,
  Relation,
  Dynasty,
  TimelineEvent,
  TimelineData,
  SearchResult,
  SearchResponse,
  ApiError,
  Figure,
  FigurePassage,
  FigureRelation,
  FigureDetail,
  FigureListResponse,
  AssetType,
  ArtStyle,
  AssetFileMetadata,
  AssetFile,
  FigureAsset,
  FigureWithAssets,
} from "../../worker/types";

/** 人物资产 API 响应：GET /api/figures/:id/assets */
export interface FigureAssetsResponse {
  figure_id: string;
  default_style: string | null;
  assets: Record<string, FigureAsset>;
}

/** 风格列表 API 响应：GET /api/art-styles */
export interface ArtStylesResponse {
  styles: ArtStyle[];
}

/** 关系图节点 API 响应字段（前端运行时再叠加 fx/fy/fz/__d 等力学/视觉字段） */
export interface GraphNode {
  id: string;
  name: string;
  identity: string;
  dynasty: string;
  gender?: string;
  star?: number;
  degree: number;
}

/** 关系图链接 */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

/** 关系图 API 响应：GET /api/figures/graph */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  total?: number;
}
