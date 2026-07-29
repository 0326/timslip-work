import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { FeatureCollection } from "geojson";
import { AtlasMap, type ProjectFn } from "../components/Atlas/AtlasMap";
import { AtlasScrubber } from "../components/Atlas/AtlasScrubber";
import { AtlasPanel } from "../components/Atlas/AtlasPanel";
import { getAtlasDetail, ATLAS_BASE } from "../components/Atlas/atlasApi";
import { EMPERORS, frameForNode, nodeForFrame } from "../components/Atlas/emperors";
import type {
  AtlasData,
  AtlasSnapshotDetail,
  RegimeProps,
} from "../components/Atlas/types";
import { useBgm } from "../store/audioStore";
import "../components/Atlas/atlas.css";

const PLAY_INTERVAL = 3200;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败：${url}（${res.status}）`);
  return res.json() as Promise<T>;
}

// === 模块级缓存：帧索引只加载一次，快照按 slug 缓存 promise（跨组件实例复用）===
let atlasDataPromise: Promise<AtlasData> | null = null;
const snapshotCache = new Map<string, Promise<FeatureCollection>>();

function getAtlasData(): Promise<AtlasData> {
  if (!atlasDataPromise) {
    atlasDataPromise = fetchJson<AtlasData>(`${ATLAS_BASE}/atlas-data.json`);
  }
  return atlasDataPromise;
}

function loadSnapshotData(slug: string): Promise<FeatureCollection> {
  if (!snapshotCache.has(slug)) {
    snapshotCache.set(slug, fetchJson<FeatureCollection>(`${ATLAS_BASE}/snapshots/${slug}.geojson`));
  }
  return snapshotCache.get(slug)!;
}

export default function AtlasPage() {
  useBgm("/assets/audio/map.mp3", 0.12);
  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [empIdx, setEmpIdx] = useState(0);
  const [snapshot, setSnapshot] = useState<FeatureCollection | null>(null);
  const [detail, setDetail] = useState<AtlasSnapshotDetail | null>(null);
  const [selected, setSelected] = useState<RegimeProps | null>(null);
  const [playing, setPlaying] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const pickEmperor = useCallback(
    (i: number) => {
      if (!data) return;
      const clamped = Math.max(0, Math.min(EMPERORS.length - 1, i));
      setEmpIdx(clamped);
      setIndex(frameForNode(EMPERORS[clamped], data.frames));
    },
    [data]
  );

  // 首次加载帧索引；支持 ?f=slug 与 ?year= 定位
  useEffect(() => {
    let alive = true;
    getAtlasData()
      .then((d) => {
        if (!alive) return;
        setData(d);
        const slug = searchParams.get("f");
        const yearRaw = searchParams.get("year");
        let init = 0;
        if (slug) {
          const i = d.frames.findIndex((f) => f.slug === slug);
          if (i >= 0) init = i;
        } else if (yearRaw && !Number.isNaN(Number(yearRaw))) {
          const year = Number(yearRaw);
          let best = Infinity;
          d.frames.forEach((f, i) => {
            const dist = Math.abs(f.year - year);
            if (dist < best) {
              best = dist;
              init = i;
            }
          });
        }
        setIndex(init);
        setEmpIdx(nodeForFrame(d.frames[init], EMPERORS));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 帧切换：取数 + 预取相邻帧 + 同步 URL
  useEffect(() => {
    if (!data) return;
    const frame = data.frames[index];
    let alive = true;
    loadSnapshotData(frame.slug)
      .then((fc) => alive && setSnapshot(fc))
      .catch((e: Error) => alive && setError(e.message));
    if (index > 0) void loadSnapshotData(data.frames[index - 1].slug).catch(() => {});
    if (index < data.frames.length - 1)
      void loadSnapshotData(data.frames[index + 1].slug).catch(() => {});

    // 富化层：figure_id 深链 + 同期人物（API 不可用则保持 null，降级到静态钉）
    setDetail(null);
    void getAtlasDetail(frame.slug).then((d) => {
      if (alive && d) setDetail(d);
    });
    if (index > 0) void getAtlasDetail(data.frames[index - 1].slug);
    if (index < data.frames.length - 1) void getAtlasDetail(data.frames[index + 1].slug);

    setSelected(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("f", frame.slug);
        next.delete("year");
        return next;
      },
      { replace: true }
    );
    return () => {
      alive = false;
    };
  }, [data, index, setSearchParams]);

  // 键盘左右：逐帝浏览
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowLeft") pickEmperor(empIdx - 1);
      if (e.key === "ArrowRight") pickEmperor(empIdx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, empIdx, pickEmperor]);

  // 自动播放（逐疆域帧推进，活动帝同步为该图时段开端之帝）
  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => {
      setIndex((i) => {
        if (i >= data.frames.length - 1) {
          setPlaying(false);
          return i;
        }
        setEmpIdx(nodeForFrame(data.frames[i + 1], EMPERORS));
        return i + 1;
      });
    }, PLAY_INTERVAL);
    return () => clearInterval(t);
  }, [playing, data]);

  const frame = data?.frames[index] ?? null;

  // 富化按人名索引（figure_id / identity），供地图钉深链
  const enrichByName = useMemo(() => {
    const m = new Map<string, { figureId?: string | null; identity?: string | null }>();
    detail?.figures.forEach((f) => m.set(f.name, { figureId: f.figureId, identity: f.identity }));
    return m;
  }, [detail]);

  const overlay = useMemo(() => {
    if (!frame) return undefined;
    const fc = snapshot;
    return (project: ProjectFn) => (
      <div className="atlas-marks" key={frame.slug}>
        {fc?.features.map((f) => {
          const p = f.properties as RegimeProps | null;
          if (!p?.regime) return null;
          const pos = project([p.labelLng, p.labelLat]);
          if (!pos) return null;
          return (
            <span
              key={`r-${p.regime}`}
              className={`atlas-regime-label kind-${p.kind}`}
              style={{ left: pos.x, top: pos.y, color: p.color }}
              onClick={() => setSelected(p)}
            >
              {p.regime}
            </span>
          );
        })}
        {frame.capitals.map((c) => {
          const pos = project(c.at);
          if (!pos) return null;
          return (
            <span
              key={`c-${c.regime}-${c.name}`}
              className="atlas-capital"
              style={{ left: pos.x, top: pos.y }}
              title={`${c.regime}都 ${c.name}`}
            >
              <i>★</i>
              {c.name}
            </span>
          );
        })}
        {frame.figures.map((f) => {
          const pos = project(f.at);
          if (!pos) return null;
          const enrich = enrichByName.get(f.name);
          const fid = enrich?.figureId;
          return (
            <button
              key={`f-${f.name}`}
              type="button"
              className="atlas-figure"
              style={{ left: pos.x, top: pos.y }}
              title={`${f.name} · ${f.place} — ${f.note}`}
              onClick={() =>
                navigate(
                  fid ? `/figures/${fid}` : `/figures?q=${encodeURIComponent(f.name)}`
                )
              }
            >
              <i>{f.name.charAt(0)}</i>
              <span>
                {f.name}
                <em>{f.note}</em>
              </span>
            </button>
          );
        })}
      </div>
    );
  }, [frame, snapshot, navigate, enrichByName]);

  if (error) {
    return (
      <div className="atlas-page atlas-page-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="atlas-page">
      <AtlasMap snapshot={snapshot} onSelectRegime={setSelected} overlay={overlay} />
      {frame && (
        <AtlasPanel
          frame={frame}
          selected={selected}
          periodFigures={detail?.periodFigures ?? []}
          onClose={() => setSelected(null)}
          onPickFigure={(id) => navigate(`/figures/${id}`)}
        />
      )}
      {data && frame && (
        <AtlasScrubber
          frames={data.frames}
          frameIndex={index}
          nodeIndex={empIdx}
          onPickNode={pickEmperor}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      )}
      {data && <p className="atlas-attribution">{data.attribution}</p>}
      {!data && <div className="atlas-loading">舆图展开中…</div>}
    </div>
  );
}
