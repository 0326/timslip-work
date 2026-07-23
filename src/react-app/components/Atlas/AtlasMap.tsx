import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification, MapGeoJSONFeature } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RegimeProps } from "./types";
import { ATLAS_BASE } from "./atlasApi";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

let basemapCache: Promise<FeatureCollection> | null = null;
function loadBasemap(): Promise<FeatureCollection> {
  if (!basemapCache) {
    basemapCache = fetch(`${ATLAS_BASE}/basemap.geojson`).then((r) => {
      if (!r.ok) throw new Error(`底图加载失败（${r.status}）`);
      return r.json() as Promise<FeatureCollection>;
    });
    basemapCache.catch(() => {
      basemapCache = null; // 失败后允许重试
    });
  }
  return basemapCache;
}

const FILL_OPACITY = 0.45;
const LINE_OPACITY = 0.85;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function buildStyle(fadeMs: number): StyleSpecification {
  const fade = { duration: fadeMs, delay: 0 };
  const snapFill = (id: "a" | "b") => ({
    id: `snap-${id}-fill`,
    type: "fill" as const,
    source: `snap-${id}`,
    paint: {
      "fill-color": ["get", "color"] as unknown as string,
      "fill-opacity": 0,
      "fill-opacity-transition": fade,
    },
  });
  const snapLine = (id: "a" | "b") => ({
    id: `snap-${id}-line`,
    type: "line" as const,
    source: `snap-${id}`,
    paint: {
      "line-color": ["get", "color"] as unknown as string,
      "line-opacity": 0,
      "line-opacity-transition": fade,
      "line-width": 1.4,
      "line-dasharray": [2.5, 2],
      "line-blur": 0.6,
    },
  });
  return {
    version: 8,
    sources: {
      // 底图数据由主线程 fetch 后 setData 注入（worker 端按 URL 加载在部分环境下会静默失败）
      basemap: { type: "geojson", data: EMPTY },
      "snap-a": { type: "geojson", data: EMPTY },
      "snap-b": { type: "geojson", data: EMPTY },
    },
    layers: [
      // 海（背景）：淡青灰宣纸底
      { id: "bg", type: "background", paint: { "background-color": "#dfe4dd" } },
      // 陆地：米黄纸
      {
        id: "land",
        type: "fill",
        source: "basemap",
        filter: ["==", ["get", "layer"], "land"],
        paint: { "fill-color": "#f3ecd8" },
      },
      // 海岸线：陆缘淡墨晕，给水陆分界以定义
      {
        id: "coast",
        type: "line",
        source: "basemap",
        filter: ["==", ["get", "layer"], "land"],
        paint: {
          "line-color": "#b7ac93",
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 7, 1.4],
          "line-blur": 0.8,
          "line-opacity": 0.7,
        },
      },
      snapFill("a"),
      snapFill("b"),
      {
        id: "lake",
        type: "fill",
        source: "basemap",
        filter: ["==", ["get", "layer"], "lake"],
        paint: { "fill-color": "#c2d0cb", "fill-opacity": 0.85 },
      },
      {
        id: "river",
        type: "line",
        source: "basemap",
        filter: ["==", ["get", "layer"], "river"],
        paint: {
          "line-color": "#9fb3ad",
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 7, 2.2],
          "line-opacity": 0.8,
          "line-blur": 0.3,
        },
      },
      snapLine("a"),
      snapLine("b"),
    ],
  };
}

export type ProjectFn = (lngLat: [number, number]) => { x: number; y: number } | null;

interface AtlasMapProps {
  /** 当前帧疆域数据；切换时地图内部做交叉淡入淡出 */
  snapshot: FeatureCollection | null;
  onSelectRegime: (props: RegimeProps | null) => void;
  /** 标注层渲染函数：由父组件用 project 把经纬度换算成容器像素 */
  overlay?: (project: ProjectFn) => ReactNode;
}

export function AtlasMap({ snapshot, onSelectRegime, overlay }: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const activeRef = useRef<"a" | "b">("a");
  const loadedRef = useRef(false);
  const pendingRef = useRef<FeatureCollection | null>(null);
  // load 完成后把实例放进 state，供渲染期的 overlay 投影使用（渲染期不读 ref）
  const [readyMap, setReadyMap] = useState<maplibregl.Map | null>(null);
  const [, setTick] = useState(0);
  const onSelectRef = useRef(onSelectRegime);
  useEffect(() => {
    onSelectRef.current = onSelectRegime;
  }, [onSelectRegime]);

  useEffect(() => {
    if (!containerRef.current) return;
    const fadeMs = reducedMotion() ? 0 : 450;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(fadeMs),
      center: [105, 35.5],
      zoom: 3.2,
      minZoom: 2.4,
      maxZoom: 7.5,
      maxBounds: [
        [55, 1],
        [155, 64],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on("error", (e) =>
      console.error("[atlas] map error:", e.error?.message ?? String(e.error), e.error)
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__atlasMap = map;
    }

    const fitView = () =>
      map.fitBounds(
        [
          [84, 19],
          [129, 49],
        ],
        { padding: { top: 30, bottom: 110, left: 30, right: 30 }, duration: 0 }
      );

    map.on("load", () => {
      loadedRef.current = true;
      map.resize();
      fitView();
      void loadBasemap()
        .then((fc) => {
          const src = map.getSource("basemap") as maplibregl.GeoJSONSource | undefined;
          src?.setData(fc);
        })
        .catch((e: Error) => console.error("[atlas]", e.message));
      if (pendingRef.current) {
        applySnapshot(map, pendingRef.current, activeRef, true);
        pendingRef.current = null;
      }
      setReadyMap(map);
    });

    // 懒加载路由下容器初始测量可能为 0（样式尚未注入），显式跟踪尺寸变化；
    // 首次从退化尺寸恢复时重新取景
    let lastW = containerRef.current.clientWidth;
    const ro = new ResizeObserver(() => {
      map.resize();
      const w = containerRef.current?.clientWidth ?? 0;
      if (lastW <= 420 && w > 420 && loadedRef.current) fitView();
      lastW = w;
    });
    ro.observe(containerRef.current);

    const bump = () => setTick((t) => t + 1);
    map.on("move", bump);
    map.on("resize", bump);

    const fillLayers = ["snap-a-fill", "snap-b-fill"];
    map.on("click", (e) => {
      const activeFill = `snap-${activeRef.current}-fill`;
      const feats = map.queryRenderedFeatures(e.point, { layers: [activeFill] });
      if (feats.length) {
        onSelectRef.current(featureProps(feats[0]));
      } else {
        onSelectRef.current(null);
      }
    });
    map.on("mousemove", (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: fillLayers });
      map.getCanvas().style.cursor = feats.length ? "pointer" : "";
    });

    return () => {
      loadedRef.current = false;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setReadyMap(null);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!snapshot) return;
    if (!map || !loadedRef.current) {
      pendingRef.current = snapshot;
      return;
    }
    applySnapshot(map, snapshot, activeRef, false);
  }, [snapshot]);

  const project: ProjectFn = (lngLat) => {
    if (!readyMap) return null;
    const p = readyMap.project(lngLat);
    return { x: p.x, y: p.y };
  };

  return (
    <div className="atlas-map-wrap">
      <div ref={containerRef} className="atlas-map" />
      {readyMap && overlay && (
        <div className="atlas-overlay" aria-hidden={false}>
          {overlay(project)}
        </div>
      )}
    </div>
  );
}

function featureProps(f: MapGeoJSONFeature): RegimeProps {
  const p = f.properties as Record<string, unknown>;
  return {
    regime: String(p.regime ?? ""),
    kind: (p.kind as RegimeProps["kind"]) ?? "power",
    color: String(p.color ?? "#8d857a"),
    note: p.note ? String(p.note) : null,
    precision: Number(p.precision ?? 1),
    labelLng: Number(p.labelLng ?? 0),
    labelLat: Number(p.labelLat ?? 0),
  };
}

function applySnapshot(
  map: maplibregl.Map,
  data: FeatureCollection,
  activeRef: { current: "a" | "b" },
  first: boolean
) {
  const next = first ? activeRef.current : activeRef.current === "a" ? "b" : "a";
  const prev = activeRef.current;
  const src = map.getSource(`snap-${next}`) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(data);
  map.setPaintProperty(`snap-${next}-fill`, "fill-opacity", FILL_OPACITY);
  map.setPaintProperty(`snap-${next}-line`, "line-opacity", LINE_OPACITY);
  if (!first && prev !== next) {
    map.setPaintProperty(`snap-${prev}-fill`, "fill-opacity", 0);
    map.setPaintProperty(`snap-${prev}-line`, "line-opacity", 0);
  }
  activeRef.current = next;
}
