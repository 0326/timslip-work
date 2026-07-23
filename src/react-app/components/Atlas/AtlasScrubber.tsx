import { useEffect, useMemo, useRef } from "react";
import type { AtlasFrame } from "./types";
import { formatYear } from "./types";
import { EMPERORS, reignLabel, type EmperorNode } from "./emperors";

interface AtlasScrubberProps {
  frames: AtlasFrame[];
  frameIndex: number;
  nodeIndex: number;
  onPickNode: (index: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
}

interface SegmentBox {
  group: string;
  x: number; // px
  width: number; // px
}

interface Layout {
  totalWidth: number;
  segments: SegmentBox[];
  nodeX: number[]; // 每个帝王节点的 px 位置
  frameX: number[]; // 每个疆域帧标记的 px 位置
}

const PX_PER_YEAR = 1.1;
const MIN_GAP = 17; // 相邻帝王节点最小像素间距
const MAX_GAP = 64; // 最大间距（夏商周等时代节点跨数百年，等比会拉出大段空轨）
const SEG_PAD = 16;

/**
 * 像素布局：段内节点先按在位起年等比铺开，再向后推挤保证最小间距；
 * 段宽由内容决定，总宽超出容器时横向滚动。疆域帧标记按年分段线性插值对齐。
 */
function layout(frames: AtlasFrame[], nodes: EmperorNode[]): Layout {
  // 连续同段聚合
  const segs: { group: string; nodeIdx: number[] }[] = [];
  nodes.forEach((n, i) => {
    const last = segs[segs.length - 1];
    if (last && last.group === n.group) last.nodeIdx.push(i);
    else segs.push({ group: n.group, nodeIdx: [i] });
  });

  const nodeX: number[] = new Array(nodes.length).fill(0);
  const segments: SegmentBox[] = [];
  // 记录每段的 (year, x) 锚点序列，供帧标记插值
  const anchorsByGroup = new Map<string, { year: number; x: number }[]>();

  let cursor = 0;
  for (const seg of segs) {
    const years = seg.nodeIdx.map((i) => nodes[i].start);
    const y0 = years[0];
    // 段内相对位置：等比 + 最小间距推挤
    const rel: number[] = [];
    for (let k = 0; k < years.length; k++) {
      const proportional = (years[k] - y0) * PX_PER_YEAR;
      rel[k] =
        k === 0
          ? 0
          : Math.min(
              Math.max(proportional, rel[k - 1] + MIN_GAP),
              rel[k - 1] + MAX_GAP
            );
    }
    const width = rel[rel.length - 1] + SEG_PAD * 2;
    const anchors: { year: number; x: number }[] = [];
    seg.nodeIdx.forEach((gi, k) => {
      nodeX[gi] = cursor + SEG_PAD + rel[k];
      anchors.push({ year: years[k], x: nodeX[gi] });
    });
    anchorsByGroup.set(
      seg.group,
      (anchorsByGroup.get(seg.group) ?? []).concat(anchors)
    );
    segments.push({ group: seg.group, x: cursor, width });
    cursor += width;
  }

  // 帧标记：同段锚点间按年线性插值（段端外侧夹紧）
  const frameX = frames.map((f) => {
    const anchors = anchorsByGroup.get(f.group);
    if (!anchors?.length) return 0;
    if (f.year <= anchors[0].year) return anchors[0].x;
    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      if (f.year >= a.year && f.year <= b.year) {
        const t = b.year > a.year ? (f.year - a.year) / (b.year - a.year) : 0;
        return a.x + t * (b.x - a.x);
      }
    }
    return anchors[anchors.length - 1].x;
  });

  return { totalWidth: cursor, segments, nodeX, frameX };
}

export function AtlasScrubber({
  frames,
  frameIndex,
  nodeIndex,
  onPickNode,
  playing,
  onTogglePlay,
}: AtlasScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const nodeIndexRef = useRef(nodeIndex);
  useEffect(() => {
    nodeIndexRef.current = nodeIndex;
  }, [nodeIndex]);

  const nodes = EMPERORS;
  const { totalWidth, segments, nodeX, frameX } = useMemo(
    () => layout(frames, nodes),
    [frames, nodes]
  );
  const activeNode = nodes[nodeIndex];
  const activeFrame = frames[frameIndex];

  // 滚轮逐帝换节点（preventDefault 需非 passive 挂载）
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      const next = nodeIndexRef.current + (delta > 0 ? 1 : -1);
      if (next >= 0 && next < nodes.length) onPickNode(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [nodes.length, onPickNode]);

  // 活动节点滚到视口中央：近距离平滑、跨段大跳直接瞬跳（平滑大跳既慢又晕）
  useEffect(() => {
    const sc = scrollRef.current;
    const x = nodeX[nodeIndex];
    if (!sc || x === undefined) return;
    const target = Math.max(0, x - sc.clientWidth / 2);
    const behavior = Math.abs(target - sc.scrollLeft) > sc.clientWidth ? "auto" : "smooth";
    sc.scrollTo({ left: target, behavior });
  }, [nodeIndex, nodeX]);

  const indexFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    nodeX.forEach((x, i) => {
      const d = Math.abs(x - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    trackRef.current?.setPointerCapture(e.pointerId);
    const i = indexFromX(e.clientX);
    if (i !== null && i !== nodeIndex) onPickNode(i);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const i = indexFromX(e.clientX);
    if (i !== null && i !== nodeIndexRef.current) onPickNode(i);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div className="atlas-scrubber" role="group" aria-label="帝王时间轴">
      <div className="atlas-scrubber-head">
        <button
          type="button"
          className="atlas-scrubber-btn"
          onClick={onTogglePlay}
          aria-label={playing ? "暂停播放" : "自动播放疆域演变"}
          title={playing ? "暂停" : "自动播放疆域演变"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="atlas-scrubber-btn"
          onClick={() => nodeIndex > 0 && onPickNode(nodeIndex - 1)}
          disabled={nodeIndex === 0}
          aria-label="上一帝"
        >
          ←
        </button>
        <button
          type="button"
          className="atlas-scrubber-btn"
          onClick={() => nodeIndex < nodes.length - 1 && onPickNode(nodeIndex + 1)}
          disabled={nodeIndex === nodes.length - 1}
          aria-label="下一帝"
        >
          →
        </button>
        <span className="atlas-scrubber-now">
          {activeNode.name}
          <em>{reignLabel(activeNode)}</em>
          {activeFrame && (
            <em className="atlas-scrubber-frame-tag">
              图·{activeFrame.label}（{formatYear(activeFrame.year)}）
            </em>
          )}
        </span>
      </div>
      <div className="atlas-scrubber-scroll" ref={scrollRef}>
        <div
          ref={trackRef}
          className="atlas-scrubber-track"
          style={{ width: totalWidth }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {segments.map((seg) => (
            <div
              key={`${seg.group}-${seg.x}`}
              className={`atlas-scrubber-seg${seg.group === activeNode.group ? " active" : ""}`}
              style={{ left: seg.x, width: seg.width }}
            >
              <span>{seg.group}</span>
            </div>
          ))}
          <div className="atlas-scrubber-rail" />
          <div className="atlas-scrubber-fill" style={{ width: nodeX[nodeIndex] ?? 0 }} />
          {/* 疆域变化标记（地图在此换幅） */}
          {frames.map((f, i) => (
            <span
              key={f.slug}
              className={`atlas-scrubber-mark${i === frameIndex ? " active" : ""}`}
              style={{ left: frameX[i] }}
              title={`疆域图·${f.label}（${formatYear(f.year)}）`}
            />
          ))}
          {nodes.map((n, i) => (
            <button
              key={n.name}
              type="button"
              className={`atlas-scrubber-node${i === nodeIndex ? " active" : ""}${n.period ? " period" : ""}`}
              style={{ left: nodeX[i] }}
              onClick={() => onPickNode(i)}
              title={`${n.name} · ${reignLabel(n)}`}
              aria-label={`${n.name}（${reignLabel(n)}）`}
              aria-current={i === nodeIndex ? "step" : undefined}
            >
              <i />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
