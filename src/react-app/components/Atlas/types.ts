// 舆图前端类型与常量 — 数据由 scripts/atlas/build.mjs 生成（public/atlas/）

export interface AtlasCapital {
  name: string;
  at: [number, number];
  regime: string;
}

export interface AtlasFigure {
  name: string;
  at: [number, number];
  place: string;
  note: string;
  // 由 /api/atlas 富化（命中 figures 表则可深链 /figures/:id + 显示身份图标）
  figureId?: string | null;
  identity?: string | null;
  avatarIcon?: string | null;
}

// 同期史册人物：由 /api/atlas 按断面年窗口自动检出，无坐标，面板列表展示
export interface AtlasPeriodFigure {
  id: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  dynasty: string;
  identity: string;
  avatarIcon: string | null;
}

// 单帧富化详情（/api/atlas/snapshots/:slug）
export interface AtlasSnapshotDetail {
  figures: AtlasFigure[];
  periodFigures: AtlasPeriodFigure[];
}

export interface AtlasFrame {
  slug: string;
  label: string;
  /** 朝代段名（时间轴按段分组，段内子帧按年份定位） */
  group: string;
  year: number;
  yearLabel: string;
  books: string[];
  blurb: string;
  capitals: AtlasCapital[];
  figures: AtlasFigure[];
  sort: number;
}

export interface AtlasData {
  attribution: string;
  frames: AtlasFrame[];
}

export type RegimeKind = "dynasty" | "power" | "tribe";

export interface RegimeProps {
  regime: string;
  kind: RegimeKind;
  color: string;
  note: string | null;
  precision: number;
  labelLng: number;
  labelLat: number;
}

export const KIND_LABEL: Record<RegimeKind, string> = {
  dynasty: "王朝",
  power: "政权",
  tribe: "部族",
};

export const BOOK_TITLES: Record<string, string> = {
  shiji: "史记",
  hanshu: "汉书",
  houhanshu: "后汉书",
  sanguozhi: "三国志",
  jinshu: "晋书",
  songshu: "宋书",
  nanqishu: "南齐书",
  liangshu: "梁书",
  chenshu: "陈书",
  weishu: "魏书",
  beiqishu: "北齐书",
  zhoushu: "周书",
  suishu: "隋书",
  nanshi: "南史",
  beishi: "北史",
  jiutangshu: "旧唐书",
  xintangshu: "新唐书",
  jiuwudaishi: "旧五代史",
  xinwudaishi: "新五代史",
  songshi: "宋史",
  liaoshi: "辽史",
  jinshi: "金史",
  yuanshi: "元史",
  mingshi: "明史",
};

export function formatYear(y: number): string {
  return y < 0 ? `公元前 ${-y} 年` : `公元 ${y} 年`;
}
