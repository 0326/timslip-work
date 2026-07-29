import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { getFigures, getFigureGraph, getFigureAssets } from "../data/api";
import { pickAssetFile, sizedAssetUrl } from "../data/figure-assets";
import type { FigureListResponse } from "../data/types";
import { FigureCard } from "../components/Figure/FigureCard";
import { Loading } from "../components/Common/Loading";
import { useAudio, useBgm } from "../store/audioStore";
import "../components/Figure/figure.css";
import "../components/Figure/figure-graph.css";

type ViewMode = "list" | "graph";

interface GNode {
  id: string;
  name: string;
  identity: string;
  dynasty: string;
  gender?: string;
  star?: number;
  degree: number;
  fx?: number;
  fy?: number;
  fz?: number;
  __d?: number;
}
interface GLink {
  source: string | GNode;
  target: string | GNode;
  type: string;
}
interface GraphData {
  nodes: GNode[];
  links: GLink[];
  total?: number;
}
type Vec = { x: number; y: number; z: number };

interface FG {
  (el: HTMLElement): FG;
  backgroundColor(v: string): FG;
  graphData(): GraphData;
  graphData(d: GraphData): FG;
  nodeLabel(fn: (n: GNode) => string): FG;
  nodeColor(fn: (n: GNode) => string): FG;
  nodeVal(fn: (n: GNode) => number): FG;
  nodeOpacity(v: number): FG;
  nodeResolution(v: number): FG;
  nodeThreeObject(fn: (n: GNode) => THREE.Object3D): FG;
  nodeThreeObjectExtend(extend: boolean): FG;
  linkColor(fn: (l: GLink) => string): FG;
  linkOpacity(v: number): FG;
  linkWidth(v: number): FG;
  onNodeClick(fn: (n: GNode) => void): FG;
  onBackgroundClick(fn: () => void): FG;
  onEngineStop(fn: () => void): FG;
  width(v: number): FG;
  height(v: number): FG;
  d3ReheatSimulation(): FG;
  cameraPosition(pos: Vec, lookAt: Vec, ms: number): FG;
  zoomToFit(ms?: number, px?: number): FG;
  _destructor?(): void;
}

const REL: Record<string, string> = {
  family: "#2e8b8b",
  sovereign: "#c08a32",
  teacher: "#8268a8",
  friend: "#3b8a4a",
  enemy: "#d8483a",
  peer: "#7a736a",
};
// 身份配色（用户指定主色调）
const IDC: Record<string, string> = {
  帝王: "#e8b400",
  将相: "#d8483a",
  文人: "#5fc6d8",
  后妃: "#e88a9e",
  刺客: "#3a3a3a",
  游侠: "#54a7e2",
  谋士: "#9b7ec8",
  异族: "#7ba05b",
};
const idColor = (n: GNode) => IDC[n.identity] || "#cdd6e8";
const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};
const nid = (e: string | GNode) => (typeof e === "string" ? e : e.id);

// === 恒星发光纹理：径向渐变 canvas → THREE.Sprite，按节点颜色缓存 ===
const glowTextureCache = new Map<string, THREE.Texture>();
const getGlowTexture = (hex: string): THREE.Texture => {
  const cached = glowTextureCache.get(hex);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  glowTextureCache.set(hex, tex);
  return tex;
};

// 节点视觉对象：核心球 + 光晕 Sprite，像恒星而非皮球
const buildStarNode = (color: string, coreSize: number): THREE.Group => {
  const group = new THREE.Group();
  // 核心球：MeshBasicMaterial 不受光照影响，保持高亮
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(coreSize, 16, 16),
    new THREE.MeshBasicMaterial({ color }),
  );
  group.add(core);
  // 光晕 Sprite：additive 混合，半径为核心 4 倍
  const haloMat = new THREE.SpriteMaterial({
    map: getGlowTexture(color),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(coreSize * 8, coreSize * 8, 1);
  group.add(halo);
  return group;
};

const PAGE_SIZE = 24;

export default function FigurePage() {
  useBgm("/assets/audio/characters.mp3", 0.3);
  const { playHoverBlip } = useAudio();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<ViewMode>("list");
  const [listItems, setListItems] = useState<FigureListResponse["items"]>([]);
  const [listMeta, setListMeta] = useState<{ total: number; filters: FigureListResponse["filters"] } | null>(null);
  const [listPage, setListPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初值支持 ?q=（舆图人物标记等外部入口带参跳转）
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  // 提交后的查询值，仅在点击搜索按钮 / 回车 / 外部带参时更新
  const [committedQuery, setCommittedQuery] = useState(() => searchParams.get("q") || "");
  const [dynastyOpen, setDynastyOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [sort, setSort] = useState<"era" | "star">("star"); // star=星级（默认，降序） | era=历史时序

  const dynasty = searchParams.get("dynasty") || "";
  const identity = searchParams.get("identity") || "";

  const mountNodeRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<FG | null>(null);
  const adjRef = useRef<Map<string, Set<string>>>(new Map());
  const graphDataRef = useRef<GraphData | null>(null);
  const starsCleanupRef = useRef<(() => void) | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [sel, setSel] = useState<GNode | null>(null);
  // 选中人物的立绘 URL：从 /api/figures/:id/assets 解析（R2 真实地址，风格/变体/扩展名不固定）
  const [selPortrait, setSelPortrait] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<GNode[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 提交搜索：点击按钮 / 回车 / 外部带参时调用
  const commitSearch = () => setCommittedQuery(query.trim());

  useEffect(() => {
    setLoading(true);
    setError(null);
    setListItems([]);
    setListPage(1);
    getFigures({
      page: 1,
      limit: PAGE_SIZE,
      dynasty: dynasty || undefined,
      identity: identity || undefined,
      q: committedQuery || undefined,
      sort,
    })
      .then((res) => {
        setListItems(res.items);
        setListMeta({ total: res.total, filters: res.filters });
      })
      .catch((err) => setError(err?.error?.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [dynasty, identity, committedQuery, sort]);

  const loadMore = () => {
    if (loadingMore || !listMeta) return;
    const nextPage = listPage + 1;
    if (nextPage * PAGE_SIZE > listMeta.total) return;
    setLoadingMore(true);
    getFigures({
      page: nextPage,
      limit: PAGE_SIZE,
      dynasty: dynasty || undefined,
      identity: identity || undefined,
      q: committedQuery || undefined,
      sort,
    })
      .then((res) => {
        setListItems((prev) => [...prev, ...res.items]);
        setListPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  // 无限滚动：IntersectionObserver 监听底部 sentinel，滚动到底部自动加载
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !query.trim() && listMeta && listItems.length < listMeta.total) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadingMore, query, listMeta, listItems.length]);

  const setFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const bfs = (start: string) => {
    const dist = new Map<string, number>([[start, 0]]);
    let frontier = [start],
      d = 0;
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier)
        for (const nb of adjRef.current.get(id) || [])
          if (!dist.has(nb)) {
            dist.set(nb, d + 1);
            next.push(nb);
          }
      frontier = next;
      d++;
    }
    return dist;
  };

  const sizeByDist = (d: number | undefined) =>
    d === 0 ? 14 : d === 1 ? 6 : d === 2 ? 3 : d === 3 ? 1.6 : d == null ? 0.5 : 1;
  const colorByDist = (n: GNode) => {
    if (n.__d == null) return "rgba(150, 160, 180, 0.14)";
    if (n.__d === 0) return idColor(n);
    if (n.__d === 1) return idColor(n);
    if (n.__d === 2) return hexA(idColor(n), 0.55);
    return "rgba(170, 180, 200, 0.3)";
  };

  // 恒星视觉对象工厂：按距离/度数决定核心大小，颜色统一用身份色
  const starObjByDist = (n: GNode) => {
    const d = n.__d;
    const core = d === 0 ? 4.5 : d === 1 ? 2.2 : d === 2 ? 1.2 : d === 3 ? 0.7 : d == null ? Math.max(0.8, 1.5 + n.degree * 0.15) : 0.5;
    return buildStarNode(idColor(n), core);
  };
  // 默认视图节点大小：度数为主，星级加权（名人即使关系少也更亮更大）
  const defaultVal = (n: GNode) => 3 + n.degree * 0.8 + ((n.star || 1) - 1) * 1.2;
  const starObjDefault = (n: GNode) => {
    const core = Math.max(0.8, 1.5 + n.degree * 0.15 + ((n.star || 1) - 1) * 0.55);
    return buildStarNode(idColor(n), core);
  };

  const focusNode = useCallback((node: GNode) => {
    const G = graphRef.current;
    if (!G) return;
    const dist = bfs(node.id);
    const gData = G.graphData();
    gData.nodes.forEach((n) => {
      n.__d = dist.get(n.id);
      if (n.id === node.id) {
        n.fx = 0;
        n.fy = 0;
        n.fz = 0;
      } else {
        n.fx = undefined;
        n.fy = undefined;
        n.fz = undefined;
      }
    });
    G.nodeVal((n) => sizeByDist(n.__d))
      .nodeColor((n) => colorByDist(n))
      .nodeThreeObject((n) => starObjByDist(n))
      .linkColor((l) =>
        nid(l.source) === node.id || nid(l.target) === node.id
          ? REL[l.type] || "rgba(180, 180, 200, 0.4)"
          : "rgba(120, 130, 160, 0.08)",
      );
    G.d3ReheatSimulation();
    setSel(node);
    setSelPortrait(null);
    playHoverBlip();
    setTimeout(
      () => G.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 900),
      250,
    );
  }, [playHoverBlip]);

  const resetView = useCallback(() => {
    const G = graphRef.current;
    if (!G) return;
    G.graphData().nodes.forEach((n) => {
      n.__d = undefined;
      n.fx = undefined;
      n.fy = undefined;
      n.fz = undefined;
    });
    G.nodeVal((n) => defaultVal(n))
      .nodeColor((n) => idColor(n))
      .nodeThreeObject((n) => starObjDefault(n))
      .linkColor((l) => REL[l.type] || "rgba(180, 180, 200, 0.2)");
    G.d3ReheatSimulation();
    G.zoomToFit(800, 80);
    setSel(null);
  }, []);

  // 选中人物变化时异步解析立绘：优先全身立绘，退化到半身；无资产则不显示。
  // cancelled 标记防止快速切换选中时旧请求覆盖新结果（清空动作在 focusNode 里同步做）。
  const selId = sel?.id ?? null;
  useEffect(() => {
    if (!selId) return;
    let cancelled = false;
    getFigureAssets(selId)
      .then((res) => {
        if (cancelled) return;
        const styleId = res.default_style ?? Object.keys(res.assets)[0];
        const asset = styleId ? res.assets[styleId] : undefined;
        const url =
          pickAssetFile(asset, "portrait-full") ?? pickAssetFile(asset, "portrait-bust");
        setSelPortrait(sizedAssetUrl(url, 640));
      })
      .catch(() => {
        if (!cancelled) setSelPortrait(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selId]);

  const buildGraph = useCallback(
    (node: HTMLDivElement, gData: GraphData) => {
      const make = ForceGraph3D as unknown as () => FG;
      const G = make()(node)
        .backgroundColor("#04060d")
        .graphData(gData)
        .nodeLabel((n) => `${n.name} · ${n.identity} · ${"★".repeat(n.star || 1)}`)
        .nodeVal((n) => defaultVal(n))
        .nodeOpacity(1)
        .nodeResolution(16)
        .nodeColor((n) => idColor(n))
        .nodeThreeObjectExtend(false)
        .nodeThreeObject((n) => starObjDefault(n))
        .linkColor((l) => REL[l.type] || "rgba(180,180,200,0.2)")
        .linkOpacity(0.35)
        .linkWidth(0.5)
        .onNodeClick((n) => focusNode(n))
        .onBackgroundClick(() => resetView())
        .width(node.clientWidth)
        .height(node.clientHeight);
      graphRef.current = G;
      // 相机先拉远，避免初始挤在簇内；待力导布局收敛后再自动取景
      G.cameraPosition({ x: 0, y: 0, z: 700 }, { x: 0, y: 0, z: 0 }, 0);
      let fitted = false;
      G.onEngineStop(() => {
        if (fitted) return;
        fitted = true;
        G.zoomToFit(700, 90);
      });
    },
    [focusNode, resetView],
  );

  // 容器挂载/卸载回调：节点真正进入 DOM 后再初始化（兼容 AnimatePresence 的延迟挂载），
  // 切回列表卸载时销毁，再次进入会重建。
  const graphMountCb = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        graphRef.current?._destructor?.();
        graphRef.current = null;
        mountNodeRef.current = null;
        return;
      }
      mountNodeRef.current = node;
      if (graphRef.current) return;
      if (graphDataRef.current) {
        buildGraph(node, graphDataRef.current);
        return;
      }
      setGraphLoading(true);
      getFigureGraph(2000)
        .then((gData: GraphData) => {
          graphDataRef.current = gData;
          const adj = new Map<string, Set<string>>();
          gData.nodes.forEach((n) => adj.set(n.id, new Set()));
          gData.links.forEach((l) => {
            adj.get(nid(l.source))?.add(nid(l.target));
            adj.get(nid(l.target))?.add(nid(l.source));
          });
          adjRef.current = adj;
          setGraphData(gData);
          setGraphLoading(false);
          if (mountNodeRef.current) buildGraph(mountNodeRef.current, gData);
        })
        .catch(() => setGraphLoading(false));
    },
    [buildGraph],
  );

  useEffect(() => {
    const onResize = () => {
      if (mountNodeRef.current && graphRef.current)
        graphRef.current
          .width(mountNodeRef.current.clientWidth)
          .height(mountNodeRef.current.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const starsMountCb = useCallback((canvas: HTMLCanvasElement | null) => {
    starsCleanupRef.current?.();
    starsCleanupRef.current = null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 真实恒星色温谱：蓝白（O/B 型）→ 白 → 暖白 → 黄 → 橙红（K/M 型），按丰度加权
    const STAR_COLORS: Array<[number, number, number]> = [
      [170, 191, 255], // 蓝白
      [202, 215, 255], // 淡蓝
      [248, 247, 255], // 白
      [255, 244, 234], // 暖白
      [255, 233, 196], // 黄
      [255, 210, 161], // 橙
    ];
    const pickColor = () => {
      // 中间色温居多，两端稀少
      const r = Math.random();
      const idx = r < 0.08 ? 0 : r < 0.24 ? 1 : r < 0.55 ? 2 : r < 0.82 ? 3 : r < 0.95 ? 4 : 5;
      return STAR_COLORS[idx];
    };

    interface Star {
      x: number; y: number; r: number;
      color: [number, number, number];
      baseA: number;
      twinkle: number;   // 相位；0 表示不闪烁
      speed: number;
      layer: number;     // 0=远景 1=中景 2=近景，决定视差漂移速度
      bright: boolean;   // 亮星：带光晕 + 十字辉
    }
    interface Nebula {
      x: number; y: number; r: number;
      hue: [number, number, number];
      alpha: number;
      driftPhase: number; // 漂移相位
      driftAmp: number;   // 漂移幅度（px）
    }
    interface Meteor { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }

    let stars: Star[] = [];
    let nebulas: Nebula[] = [];
    let meteor: Meteor | null = null;
    let nextMeteorAt = 400 + Math.random() * 500; // 帧数计
    let t = 0;
    let raf = 0;
    // 各层视差漂移速度（px/帧）：远景近乎静止，近景略快，缓慢整体流动
    const LAYER_DRIFT = [0.004, 0.01, 0.022];

    // 高斯随机（Box-Muller），用于银河带内星星沿中线的密度衰减
    const gauss = () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      // 银河带：一条穿过画面的斜线，带内星星密集、带外稀疏
      const bandAngle = -0.42 + Math.random() * 0.2;
      const bandOffset = h * (0.35 + Math.random() * 0.3);
      const bandY = (x: number) => bandOffset + x * Math.tan(bandAngle);
      const bandSpread = Math.min(w, h) * 0.16;

      stars = [];
      const makeStar = (x: number, y: number, layer: number, dim: boolean): Star => {
        const bright = !dim && layer === 2 && Math.random() < 0.035;
        return {
          x, y, layer, bright,
          r: dim
            ? Math.random() * 0.6 + 0.25
            : (Math.random() * 0.9 + 0.4) * (layer * 0.45 + 0.6) + (bright ? 0.9 : 0),
          color: pickColor(),
          baseA: dim ? Math.random() * 0.3 + 0.12 : Math.random() * 0.45 + 0.3 + layer * 0.08,
          // 只有约 1/3 的星星有可感知的闪烁，其余恒定，避免整屏一起眨眼
          twinkle: Math.random() < 0.35 ? Math.random() * Math.PI * 2 : 0,
          speed: Math.random() * 0.02 + 0.006,
        };
      };
      // 均匀星野：三层视差
      const fieldCount = Math.floor((w * h) / 4500);
      for (let i = 0; i < fieldCount; i++) {
        const layer = Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : 2;
        stars.push(makeStar(Math.random() * w, Math.random() * h, layer, false));
      }
      // 银河带：额外一批暗而密的微星，沿中线高斯分布
      const bandCount = Math.floor(w / 2.2);
      for (let i = 0; i < bandCount; i++) {
        const x = Math.random() * w;
        const y = bandY(x) + gauss() * bandSpread;
        if (y > -20 && y < h + 20) stars.push(makeStar(x, y, 0, true));
      }

      // 星云：银河带沿线 2-3 团 + 画面四周点缀，色相偏深空（紫/蓝/青/洋红）
      const NEBULA_HUES: Array<[number, number, number]> = [
        [96, 70, 165],   // 深紫
        [52, 96, 180],   // 靛蓝
        [40, 120, 150],  // 青
        [150, 68, 130],  // 洋红
        [70, 60, 150],   // 蓝紫
      ];
      nebulas = [];
      for (let i = 0; i < 3; i++) {
        const x = w * (0.15 + 0.35 * i + Math.random() * 0.1);
        nebulas.push({
          x,
          y: bandY(x) + (Math.random() - 0.5) * bandSpread * 2,
          r: Math.min(w, h) * (0.28 + Math.random() * 0.22),
          hue: NEBULA_HUES[Math.floor(Math.random() * NEBULA_HUES.length)],
          alpha: 0.07 + Math.random() * 0.05,
          driftPhase: Math.random() * Math.PI * 2,
          driftAmp: 14 + Math.random() * 18,
        });
      }
      nebulas.push(
        { x: w * 0.12, y: h * 0.82, r: Math.min(w, h) * 0.3, hue: NEBULA_HUES[2], alpha: 0.05, driftPhase: 1.3, driftAmp: 12 },
        { x: w * 0.88, y: h * 0.15, r: Math.min(w, h) * 0.34, hue: NEBULA_HUES[0], alpha: 0.06, driftPhase: 4.1, driftAmp: 16 },
      );
    };

    const drawStar = (s: Star, w: number) => {
      // 视差漂移：按层速度整体缓慢左移，出界回绕
      let x = (s.x - t * LAYER_DRIFT[s.layer]) % w;
      if (x < 0) x += w;
      const tw = s.twinkle ? Math.sin(s.twinkle + t * s.speed) * 0.28 : 0;
      const a = Math.max(0.05, Math.min(1, s.baseA + tw));
      const [cr, cg, cb] = s.color;

      if (s.bright) {
        // 亮星：柔和光晕 + 淡淡的衍射十字
        const glowR = s.r * 5;
        const g = ctx.createRadialGradient(x, s.y, 0, x, s.y, glowR);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${a * 0.5})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - glowR, s.y - glowR, glowR * 2, glowR * 2);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a * 0.32})`;
        ctx.lineWidth = 0.7;
        const spike = s.r * 6;
        ctx.beginPath();
        ctx.moveTo(x - spike, s.y); ctx.lineTo(x + spike, s.y);
        ctx.moveTo(x, s.y - spike); ctx.lineTo(x, s.y + spike);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.fill();
    };

    const animate = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      t += 1;

      ctx.clearRect(0, 0, w, h);

      // 星云：位置缓慢漂移 + 透明度呼吸，叠加出深空的层次
      nebulas.forEach((n) => {
        const dx = Math.sin(n.driftPhase + t * 0.0012) * n.driftAmp;
        const dy = Math.cos(n.driftPhase * 1.7 + t * 0.0009) * n.driftAmp * 0.6;
        const breathe = 1 + Math.sin(n.driftPhase + t * 0.002) * 0.18;
        const [hr, hg, hb] = n.hue;
        const g = ctx.createRadialGradient(n.x + dx, n.y + dy, 0, n.x + dx, n.y + dy, n.r);
        g.addColorStop(0, `rgba(${hr},${hg},${hb},${n.alpha * breathe})`);
        g.addColorStop(0.5, `rgba(${hr},${hg},${hb},${n.alpha * breathe * 0.4})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(n.x + dx - n.r, n.y + dy - n.r, n.r * 2, n.r * 2);
      });

      stars.forEach((s) => drawStar(s, w));

      // 流星：低频偶发，短暂划过带渐隐尾迹
      if (!meteor && t > nextMeteorAt) {
        const fromLeft = Math.random() < 0.5;
        meteor = {
          x: fromLeft ? Math.random() * w * 0.3 : w * (0.7 + Math.random() * 0.3),
          y: Math.random() * h * 0.4,
          vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 4),
          vy: 2.5 + Math.random() * 2,
          life: 0,
          maxLife: 40 + Math.random() * 25,
        };
      }
      if (meteor) {
        meteor.life += 1;
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        const fade = Math.sin((meteor.life / meteor.maxLife) * Math.PI); // 淡入淡出
        const tailLen = 14;
        const g = ctx.createLinearGradient(
          meteor.x, meteor.y,
          meteor.x - meteor.vx * tailLen, meteor.y - meteor.vy * tailLen,
        );
        g.addColorStop(0, `rgba(230,240,255,${0.85 * fade})`);
        g.addColorStop(1, "rgba(230,240,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(meteor.x - meteor.vx * tailLen, meteor.y - meteor.vy * tailLen);
        ctx.stroke();
        if (meteor.life > meteor.maxLife || meteor.x < -100 || meteor.x > w + 100 || meteor.y > h + 100) {
          meteor = null;
          nextMeteorAt = t + 500 + Math.random() * 800; // 约 8-22 秒一颗
        }
      }

      raf = requestAnimationFrame(animate);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    starsCleanupRef.current = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (!graphData || !v.trim()) {
      setSearchSuggestions([]);
      return;
    }
    const q = v.toLowerCase();
    const matches = graphData.nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 8);
    setSearchSuggestions(matches);
  };

  const handleSearchSelect = (node: GNode) => {
    setSearchInput(node.name);
    setSearchSuggestions([]);
    focusNode(node);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDynastyOpen(false);
        setIdentityOpen(false);
        setSearchSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (loading) return <Loading />;
  if (error)
    return (
      <div className="figure-page">
        <div style={{ padding: "var(--space-xl)", margin: "0 auto" }}>{error}</div>
      </div>
    );
  if (!listMeta) return null;

  const isList = mode === "list";
  const isGraph = mode === "graph";
  const items = listItems;

  const currentDynastyLabel =
    listMeta.filters.dynasties.find((d) => d.value === dynasty)?.value || "全部朝代";
  const currentIdentityLabel =
    listMeta.filters.identities.find((i) => i.value === identity)?.value || "全部身份";

  return (
    <div className={`figure-page ${mode === "graph" ? "is-graph" : "is-list"}`}>
      <AnimatePresence mode="wait">
        {mode === "list" && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="figure-list-view"
          >
            <div className="figure-topbar">
              <div className="figure-topbar-left">
                <div className="figure-search-combo">
                  <div className="figure-filter-dropdowns">
                    <div className={`figure-filter-btn ${dynastyOpen ? "open" : ""}`}>
                      <button
                        className="figure-filter-trigger"
                        onClick={() => {
                          setDynastyOpen(!dynastyOpen);
                          setIdentityOpen(false);
                        }}
                        onMouseEnter={playHoverBlip}
                      >
                        <span className="figure-filter-label">{currentDynastyLabel}</span>
                        <i className="ti ti-chevron-down" />
                      </button>
                      {dynastyOpen && (
                        <div className="figure-filter-menu">
                          <div
                            className={`figure-filter-item ${!dynasty ? "active" : ""}`}
                            onClick={() => {
                              setFilter("dynasty", "");
                              setDynastyOpen(false);
                            }}
                          >
                            全部朝代
                          </div>
                          {listMeta.filters.dynasties.map((d) => (
                            <div
                              key={d.value}
                              className={`figure-filter-item ${dynasty === d.value ? "active" : ""}`}
                              onClick={() => {
                                setFilter("dynasty", d.value);
                                setDynastyOpen(false);
                              }}
                            >
                              {d.value}
                              <span className="figure-filter-count">{d.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`figure-filter-btn ${identityOpen ? "open" : ""}`}>
                      <button
                        className="figure-filter-trigger"
                        onClick={() => {
                          setIdentityOpen(!identityOpen);
                          setDynastyOpen(false);
                        }}
                        onMouseEnter={playHoverBlip}
                      >
                        <span className="figure-filter-label">{currentIdentityLabel}</span>
                        <i className="ti ti-chevron-down" />
                      </button>
                      {identityOpen && (
                        <div className="figure-filter-menu">
                          <div
                            className={`figure-filter-item ${!identity ? "active" : ""}`}
                            onClick={() => {
                              setFilter("identity", "");
                              setIdentityOpen(false);
                            }}
                          >
                            全部身份
                          </div>
                          {listMeta.filters.identities.map((i) => (
                            <div
                              key={i.value}
                              className={`figure-filter-item ${identity === i.value ? "active" : ""}`}
                              onClick={() => {
                                setFilter("identity", i.value);
                                setIdentityOpen(false);
                              }}
                            >
                              {i.value}
                              <span className="figure-filter-count">{i.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="figure-search-icon">
                    <i className="ti ti-search" />
                  </div>
                  <input
                    className="figure-search-input"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitSearch();
                      }
                    }}
                    placeholder="搜索人名 / 字号 / 别称…"
                    aria-label="搜索人物"
                  />
                  <button
                    type="button"
                    className="figure-search-btn"
                    onClick={commitSearch}
                  >
                    搜索
                  </button>
                </div>
              </div>
              <div className="figure-topbar-right">
                <span className="figure-count">
                  共 {listMeta.total} 人
                </span>
                {isList && (
                  <div className="figure-mode-switch figure-sort-switch">
                    <button
                      className={`figure-mode-btn ${sort === "star" ? "active" : ""}`}
                      onClick={() => setSort("star")}
                      onMouseEnter={playHoverBlip}
                      title="按人物星级排列（降序）"
                    >
                      <i className="ti ti-star-filled" />
                      星级
                    </button>
                    <button
                      className={`figure-mode-btn ${sort === "era" ? "active" : ""}`}
                      onClick={() => setSort("era")}
                      onMouseEnter={playHoverBlip}
                      title="按历史时序排列"
                    >
                      <i className="ti ti-history" />
                      时序
                    </button>
                  </div>
                )}
                <div className="figure-mode-switch">
                  <button
                    className={`figure-mode-btn ${isList ? "active" : ""}`}
                    onClick={() => setMode("list")}
                    onMouseEnter={playHoverBlip}
                  >
                    <i className="ti ti-layout-grid" />
                    列表
                  </button>
                  <button
                    className={`figure-mode-btn ${isGraph ? "active" : ""}`}
                    onClick={() => setMode("graph")}
                    onMouseEnter={playHoverBlip}
                  >
                    <i className="ti ti-star" />
                    星图
                  </button>
                </div>
              </div>
            </div>
            <div className="figure-list-content">
              {items.length === 0 && !loading ? (
                <div className="figure-empty">
                  {committedQuery ? `没有匹配「${committedQuery}」的人物` : "暂无数据"}
                </div>
              ) : (
                <motion.div
                  className="figure-list-grid"
                  key={`${dynasty}|${identity}|${committedQuery}|${sort}`}
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
                  initial="hidden"
                  animate="show"
                >
                  {items.map((figure) => (
                    <FigureCard key={figure.id} figure={figure} />
                  ))}
                </motion.div>
              )}
              {/* 无限滚动 sentinel + 加载指示器 */}
              <div ref={sentinelRef} className="figure-load-sentinel">
                {loadingMore && (
                  <span className="figure-load-spinner" />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {mode === "graph" && (
          <motion.div
            key="graph"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="figure-graph-view"
          >
            <canvas ref={starsMountCb} className="fgx-stars" />
            <div ref={graphMountCb} className="fgx-canvas" />
            {graphLoading && <div className="fgx-loading">星图加载中…</div>}

            <div className="fgx-topbar">
              <div className="fgx-topbar-left" ref={dropdownRef}>
                <div className="fgx-search-wrap">
                  <i className="ti ti-search fgx-search-icon" />
                  <input
                    className="fgx-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    placeholder="搜索星空中的人物…"
                    aria-label="搜索人物定位"
                  />
                  {searchSuggestions.length > 0 && (
                    <div className="fgx-search-dropdown">
                      {searchSuggestions.map((n) => (
                        <div
                          key={n.id}
                          className="fgx-search-item"
                          onClick={() => handleSearchSelect(n)}
                          onMouseEnter={playHoverBlip}
                        >
                          <span className="fgx-search-name">{n.name}</span>
                          <span className="fgx-search-meta">
                            {n.dynasty} · {n.identity}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="fgx-topbar-right">
                <div className="figure-mode-switch is-dark">
                  <button
                    className={`figure-mode-btn ${isList ? "active" : ""}`}
                    onClick={() => setMode("list")}
                    onMouseEnter={playHoverBlip}
                  >
                    <i className="ti ti-layout-grid" />
                    列表
                  </button>
                  <button
                    className={`figure-mode-btn ${isGraph ? "active" : ""}`}
                    onClick={() => setMode("graph")}
                    onMouseEnter={playHoverBlip}
                  >
                    <i className="ti ti-star" />
                    星图
                  </button>
                </div>
                {sel && (
                  <button className="fgx-reset" onClick={resetView} onMouseEnter={playHoverBlip}>
                    <i className="ti ti-refresh" /> 重置
                  </button>
                )}
              </div>
            </div>

            {sel && (
              <div className="fgx-focus">
                {selPortrait && (
                  <img
                    key={selPortrait}
                    className="fgx-focus-portrait"
                    src={selPortrait}
                    alt={sel.name}
                    onError={() => setSelPortrait(null)}
                  />
                )}
                <div className="fgx-focus-info">
                  <span className="fgx-focus-name">{sel.name}</span>
                  <span className="fgx-focus-meta">
                    {sel.dynasty} · {sel.identity}
                  </span>
                  <span className="fgx-focus-stars">
                    {"★".repeat(sel.star || 1)}
                    <span className="fgx-focus-degree">人脉 {sel.degree}</span>
                  </span>
                  <Link to={`/figures/${sel.id}`} className="fgx-focus-link">
                    查看详情 <i className="ti ti-arrow-right" />
                  </Link>
                </div>
              </div>
            )}

            <div className="fgx-legend">
              {graphData && (
                <span className="fgx-legend-desc">
                  人脉度数前 {graphData.nodes.length} 人 · 全库共 {graphData.total ?? graphData.nodes.length} 人
                </span>
              )}
              <span className="fgx-legend-hint">
                点击星点居中 · 逐级缩小 · 拖拽旋转
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
