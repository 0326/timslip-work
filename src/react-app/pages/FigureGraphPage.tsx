import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ForceGraph3D from "3d-force-graph";
import "../components/Figure/figure-graph.css";

interface GNode {
  id: string; name: string; identity: string; dynasty: string; degree: number;
  fx?: number; fy?: number; fz?: number; __d?: number;
}
interface GLink { source: string | GNode; target: string | GNode; type: string; }
interface GraphData { nodes: GNode[]; links: GLink[]; }
type Vec = { x: number; y: number; z: number };

// 3d-force-graph 的链式实例（仅声明用到的方法，避免 any）
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
  linkColor(fn: (l: GLink) => string): FG;
  linkOpacity(v: number): FG;
  linkWidth(v: number): FG;
  onNodeClick(fn: (n: GNode) => void): FG;
  onBackgroundClick(fn: () => void): FG;
  width(v: number): FG;
  height(v: number): FG;
  d3ReheatSimulation(): FG;
  cameraPosition(pos: Vec, lookAt: Vec, ms: number): FG;
  _destructor?(): void;
}

const IDC: Record<string, string> = {
  帝王: "#e0564a", 将相: "#6f97b4", 文人: "#3fb6b6", 谋士: "#a98fd0",
  刺客: "#d4625a", 后妃: "#d98aa0", 游侠: "#e0b15a", 异族: "#cf9b6a",
};
const REL: Record<string, string> = {
  family: "#2e8b8b", sovereign: "#c08a32", teacher: "#8268a8",
  friend: "#3b8a4a", enemy: "#d8483a", peer: "#7a736a",
};
const REL_LABEL: Record<string, string> = {
  enemy: "敌对", sovereign: "君臣", family: "亲缘", teacher: "师承", friend: "挚友", peer: "同侪",
};
const idColor = (n: GNode) => IDC[n.identity] || "#9a8f7d";
const nid = (e: string | GNode) => (typeof e === "string" ? e : e.id);
const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

export default function FigureGraphPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<FG | null>(null);
  const adjRef = useRef<Map<string, Set<string>>>(new Map());
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<GNode | null>(null);

  const bfs = (start: string) => {
    const dist = new Map<string, number>([[start, 0]]);
    let frontier = [start], d = 0;
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier)
        for (const nb of adjRef.current.get(id) || [])
          if (!dist.has(nb)) { dist.set(nb, d + 1); next.push(nb); }
      frontier = next; d++;
    }
    return dist;
  };
  const sizeByDist = (d: number | undefined) =>
    d === 0 ? 14 : d === 1 ? 6 : d === 2 ? 3 : d === 3 ? 1.6 : d == null ? 0.5 : 1;
  const colorByDist = (n: GNode, focus: string) => {
    if (n.__d == null) return "rgba(120,114,104,0.16)";
    if (n.id === focus) return idColor(n);
    return hexA(idColor(n), n.__d <= 1 ? 0.95 : n.__d === 2 ? 0.6 : 0.32);
  };

  const focusNode = (node: GNode) => {
    const G = graphRef.current;
    if (!G) return;
    const dist = bfs(node.id);
    const data = G.graphData();
    data.nodes.forEach((n) => {
      n.__d = dist.get(n.id);
      if (n.id === node.id) { n.fx = 0; n.fy = 0; n.fz = 0; }
      else { n.fx = undefined; n.fy = undefined; n.fz = undefined; }
    });
    G.nodeVal((n) => sizeByDist(n.__d))
      .nodeColor((n) => colorByDist(n, node.id))
      .linkColor((l) =>
        nid(l.source) === node.id || nid(l.target) === node.id
          ? REL[l.type] || "#888"
          : "rgba(120,114,104,0.1)");
    G.d3ReheatSimulation();
    setSel(node);
    setTimeout(() => G.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 900), 250);
  };

  const resetView = () => {
    const G = graphRef.current;
    if (!G) return;
    G.graphData().nodes.forEach((n) => { n.__d = undefined; n.fx = undefined; n.fy = undefined; n.fz = undefined; });
    G.nodeVal((n) => 1.5 + n.degree * 0.5)
      .nodeColor((n) => idColor(n))
      .linkColor((l) => REL[l.type] || "#555");
    G.d3ReheatSimulation();
    setSel(null);
  };

  useEffect(() => {
    let disposed = false;
    let onResize: (() => void) | null = null;
    fetch("/api/figures/graph")
      .then((r) => r.json())
      .then((data: GraphData) => {
        if (disposed || !mountRef.current) return;
        const adj = new Map<string, Set<string>>();
        data.nodes.forEach((n) => adj.set(n.id, new Set()));
        data.links.forEach((l) => {
          adj.get(nid(l.source))?.add(nid(l.target));
          adj.get(nid(l.target))?.add(nid(l.source));
        });
        adjRef.current = adj;

        const make = ForceGraph3D as unknown as () => FG;
        const G = make()(mountRef.current)
          .backgroundColor("#0d0b09")
          .graphData(data)
          .nodeLabel((n) => `${n.name} · ${n.identity}`)
          .nodeColor((n) => idColor(n))
          .nodeVal((n) => 1.5 + n.degree * 0.5)
          .nodeOpacity(0.92)
          .nodeResolution(12)
          .linkColor((l) => REL[l.type] || "#555")
          .linkOpacity(0.32)
          .linkWidth(0.5)
          .onNodeClick((n) => focusNode(n))
          .onBackgroundClick(() => resetView())
          .width(mountRef.current.clientWidth)
          .height(mountRef.current.clientHeight);
        graphRef.current = G;
        setLoading(false);

        onResize = () => {
          if (mountRef.current) G.width(mountRef.current.clientWidth).height(mountRef.current.clientHeight);
        };
        window.addEventListener("resize", onResize);

        const focusId = params.get("focus");
        if (focusId) {
          const target = data.nodes.find((n) => n.id === focusId);
          if (target) setTimeout(() => focusNode(target), 600);
        }
      })
      .catch(() => setLoading(false));

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener("resize", onResize);
      graphRef.current?._destructor?.();
      if (mountRef.current) mountRef.current.innerHTML = "";
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="fgx">
      <div ref={mountRef} className="fgx-canvas" />
      {loading && <div className="fgx-loading">星图加载中…</div>}

      <div className="fgx-topbar">
        <Link to="/figures" className="fgx-back"><i className="ti ti-arrow-left" aria-hidden="true" /> 群英谱</Link>
        <div className="fgx-title">群英关系星图</div>
        <button className="fgx-reset" onClick={resetView} style={{ visibility: sel ? "visible" : "hidden" }}>
          <i className="ti ti-refresh" aria-hidden="true" /> 重置
        </button>
      </div>

      {sel && (
        <div className="fgx-focus" data-identity={sel.identity}>
          <span className="fgx-focus-name">{sel.name}</span>
          <span className="fgx-focus-meta">{sel.dynasty} · {sel.identity} · 人脉 {sel.degree}</span>
        </div>
      )}

      <div className="fgx-legend">
        {Object.entries(REL_LABEL).map(([k, label]) => (
          <span key={k}><i style={{ background: REL[k] }} />{label}</span>
        ))}
        <span className="fgx-legend-hint">点击星点居中 · 逐级缩小 · 拖拽旋转</span>
      </div>
    </div>
  );
}
