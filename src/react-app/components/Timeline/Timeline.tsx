import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Dynasty, TimelineData } from "../../data/types";
import { WarpCanvas } from "./WarpCanvas";
import { VortexCanvas } from "./VortexCanvas";
import { ImplosionCanvas } from "./ImplosionCanvas";
import { RiverCanvas } from "./RiverCanvas";
import { DynastyNode } from "./DynastyNode";
import { Header } from "../Common/Header";
import { FloatingBubble } from "../Circle/FloatingBubble";
import "./timeline.css";

const SLOT_WIDTH = 150;

// 书名：按《》拆，每部独占一列（《史记》《汉书》→ ["史记","汉书"]）
function splitBooks(label: string): string[] {
  const m = label.match(/《(.+?)》/g);
  return m ? m.map((s) => s.replace(/《|》/g, "")) : [label.replace(/《|》/g, "")];
}

// 描述：先按句末标点（。！？；）切成完整句子，每句一列；
// 句子去标点后 > 16 字且含「，」的，在最靠近中点的「，」处再断成两列（列尾保留逗号）。
function splitDescColumns(desc: string): string[] {
  const sentences = desc.match(/[^。！？；]*[。！？；]/g);
  const list = sentences && sentences.length ? sentences : [desc];
  const cols: string[] = [];
  for (const s of list) {
    const core = s.replace(/[。！？；，、《》]/g, "");
    const commas: number[] = [];
    for (let i = 0; i < s.length; i++) if (s[i] === "，") commas.push(i);
    if (core.length > 16 && commas.length > 0) {
      const mid = s.length / 2;
      const cut = commas.reduce(
        (b, i) => (Math.abs(i - mid) < Math.abs(b - mid) ? i : b),
        commas[0],
      );
      cols.push(s.slice(0, cut + 1));
      cols.push(s.slice(cut + 1));
    } else {
      cols.push(s);
    }
  }
  return cols.filter((c) => c.trim().length > 0);
}

// 一个朝代的竖排文字层：书名列（右起，多部缩小字号）+ 描述各句列（依次向左）
function DynastyText({ dynasty }: { dynasty: Dynasty }) {
  const books = splitBooks(dynasty.book_label);
  const descCols = splitDescColumns(dynasty.description || "敬请期待");
  const multi = books.length > 1;
  return (
    <>
      {books.map((b, i) => (
        <div
          key={`b${i}`}
          className={`portal-center-book-name${multi ? " multi" : ""}`}
        >
          {b}
        </div>
      ))}
      {descCols.map((s, i) => (
        <div key={`d${i}`} className="portal-center-desc">
          {s}
        </div>
      ))}
    </>
  );
}

interface TimelineProps {
  data: TimelineData;
}

export function Timeline({ data }: TimelineProps) {
  const navigate = useNavigate();
  const dynasties = data.dynasties;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showScrollHint, setShowScrollHint] = useState(true);
  // 黑洞穿越态：鼠标悬停可穿越的 CTA 时触发（按钮变圆 + 粒子吸入 + 文字变 穿越·XX）
  const [warp, setWarp] = useState(false);
  // 奇点态：点击 CTA 后触发，整页像素被吸入黑洞，然后跳转
  const [singularity, setSingularity] = useState(false);
  const [isImageTransitioning, setIsImageTransitioning] = useState(false);
  const [previousDynasty, setPreviousDynasty] = useState<Dynasty | null>(null);
  // Text cross-fade: previous text stays visible while new text fades in on top.
  const [previousTextDynasty, setPreviousTextDynasty] = useState<Dynasty | null>(null);
  const [textFadeIn, setTextFadeIn] = useState(true); // true = current text visible
  // Start fully revealed: the first dynasty's image must be visible at rest.
  // (It is reset to 0 and animated to 1 on each subsequent selection change.)
  const [wipeProgress, setWipeProgress] = useState(1);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(0);
  const transitioningRef = useRef(false);
  const currentOffsetRef = useRef(0);
  const targetOffsetRef = useRef(0);
  const goToRef = useRef<((i: number) => void) | null>(null);

  const selectedDynasty = dynasties[selectedIndex] || dynasties[0];
  const trackWidth = dynasties.length * SLOT_WIDTH;

  // 只有已开启（史记）朝代的 CTA 可穿越；书名从 book_label 取首部（《史记》→ 史记）
  const ctaActive = !!(selectedDynasty.is_active && selectedDynasty.book_ids?.includes("shiji"));
  const bookName =
    selectedDynasty.book_label?.match(/《(.+?)》/)?.[1] || selectedDynasty.book_label || "史记";

  // Preload background images.
  useEffect(() => {
    dynasties.forEach((d) => {
      const img = new Image();
      img.src = `assets/${d.img}`;
    });
  }, [dynasties]);

  // Apply a selection change: cross-fade/wipe the background & cross-fade text.
  const applySelection = useCallback(
    (index: number) => {
      if (index === currentIndexRef.current) return;
      const prev = dynasties[currentIndexRef.current];
      currentIndexRef.current = index;
      setActiveIndex(index);

      if (transitioningRef.current) {
        setSelectedIndex(index);
        return;
      }

      transitioningRef.current = true;

      // --- Image: clip-path wipe transition ---
      setPreviousDynasty(prev);
      setIsImageTransitioning(true);
      setWipeProgress(0);

      const start = performance.now();
      const duration = 600;
      const animate = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        setWipeProgress(1 - Math.pow(1 - p, 3));
        if (p < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsImageTransitioning(false);
          setPreviousDynasty(null);
          transitioningRef.current = false;
        }
      };
      requestAnimationFrame(animate);

      // --- Text: cross-fade (no blink) ---
      // 1. Snapshot current text as "previous" (stays visible at full opacity)
      // 2. Immediately update selectedIndex so new text is available
      // 3. Fade new text in on top → old text fades out simultaneously
      setPreviousTextDynasty(prev);
      setTextFadeIn(false); // new text starts hidden
      setSelectedIndex(index); // swap content immediately
      // Next frame: trigger fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTextFadeIn(true));
      });
      // After cross-fade completes, remove previous text layer
      window.setTimeout(() => {
        setPreviousTextDynasty(null);
      }, 400);
    },
    [dynasties],
  );

  // Timeline scroll engine: JS transform + lerp for smooth inertial motion.
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    let cw = viewport.clientWidth;
    const minOffset = () => SLOT_WIDTH / 2 - cw / 2;
    const maxOffset = () => (dynasties.length - 1) * SLOT_WIDTH + SLOT_WIDTH / 2 - cw / 2;
    const clamp = (o: number) => Math.max(minOffset(), Math.min(o, maxOffset()));
    const offsetForIndex = (i: number) => clamp(i * SLOT_WIDTH + SLOT_WIDTH / 2 - cw / 2);
    const indexForOffset = (o: number) =>
      Math.max(0, Math.min(dynasties.length - 1, Math.round((o + cw / 2 - SLOT_WIDTH / 2) / SLOT_WIDTH)));

    currentOffsetRef.current = offsetForIndex(currentIndexRef.current);
    targetOffsetRef.current = currentOffsetRef.current;
    track.style.transform = `translate3d(${-currentOffsetRef.current}px,0,0)`;

    goToRef.current = (i: number) => {
      targetOffsetRef.current = offsetForIndex(i);
      setShowScrollHint(false);
    };

    let raf = 0;
    const loop = () => {
      const cur = currentOffsetRef.current;
      const tgt = targetOffsetRef.current;
      const next = Math.abs(tgt - cur) < 0.4 ? tgt : cur + (tgt - cur) * 0.16;
      if (next !== cur) {
        currentOffsetRef.current = next;
        track.style.transform = `translate3d(${-next}px,0,0)`;
        const idx = indexForOffset(next);
        if (idx !== currentIndexRef.current) applySelection(idx);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let idleTimer = 0;
    const settle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        targetOffsetRef.current = offsetForIndex(indexForOffset(targetOffsetRef.current));
      }, 120);
    };
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      targetOffsetRef.current = clamp(targetOffsetRef.current + delta);
      setShowScrollHint(false);
      settle();
    };
    window.addEventListener("wheel", onWheel, { passive: true });

    // Pointer drag (touch + mouse) on the timeline bar.
    let dragging = false;
    let startX = 0;
    let startOffset = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      startX = e.clientX;
      startOffset = targetOffsetRef.current;
      viewport.classList.add("dragging");
      setShowScrollHint(false);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      targetOffsetRef.current = clamp(startOffset - (e.clientX - startX));
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove("dragging");
      targetOffsetRef.current = offsetForIndex(indexForOffset(targetOffsetRef.current));
    };
    viewport.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    // Keyboard navigation
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        const next = Math.max(0, currentIndexRef.current - 1);
        goToRef.current?.(next);
      } else if (e.key === "ArrowRight") {
        const next = Math.min(dynasties.length - 1, currentIndexRef.current + 1);
        goToRef.current?.(next);
      } else if (e.key === "Enter") {
        const d = dynasties[currentIndexRef.current];
        if (d?.is_active && d.book_ids?.includes("shiji")) {
          window.location.href = "https://shiji.timeslip.work";
        }
      }
    };
    window.addEventListener("keydown", onKey);

    const onResize = () => {
      cw = viewport.clientWidth;
      targetOffsetRef.current = offsetForIndex(currentIndexRef.current);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      window.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [applySelection, dynasties, navigate]);

  const handleCtaClick = () => {
    if (singularity) return;
    if (selectedDynasty.is_active && selectedDynasty.book_ids?.includes("shiji")) {
      // 进入奇点态：ImplosionCanvas 负责截图整页 → 像素吸入 → onDone 跳转
      setWarp(true);
      setSingularity(true);
    }
    // 其他史书暂未开启穿越
  };

  return (
    <div className={`timslip-portal${singularity ? " portal-singularity" : ""}`}>
      {/* Background */}
      <div className="portal-bg-layer">
        <div className="portal-bg-images">
          <div className="portal-bg-image portal-bg-image-previous">
            {previousDynasty && <img src={`assets/${previousDynasty.img}`} alt="" />}
          </div>
          <div
            className="portal-bg-image portal-bg-image-current"
            style={{ clipPath: `inset(0 ${100 - wipeProgress * 100}% 0 0)` }}
          >
            <img src={`assets/${selectedDynasty.img}`} alt="" />
          </div>
        </div>
        <div
          className="portal-wipe-overlay"
          style={{
            clipPath: `inset(0 ${100 - wipeProgress * 100}% 0 0)`,
            opacity: isImageTransitioning ? 1 : 0,
          }}
        />
      </div>

      {/* 历史长河粒子（横向流动）+ 背景空间扭曲（hover）+ 水墨旋涡（像 logo） */}
      <RiverCanvas />
      <WarpCanvas />
      <VortexCanvas />

      {/* 奇点态：整页像素被吸入黑洞，播完跳转子站 */}
      {singularity && (
        <ImplosionCanvas
          active
          duration={2400}
          onDone={() => {
            window.location.href = "https://shiji.timeslip.work";
          }}
        />
      )}

      {/* 奇点闪光 */}
      {singularity && <div className="portal-singularity-flash" />}

      {/* Navigation */}
      <Header />

      {/* Center Content */}
      <div className="portal-center-content">
        {/* 史书标题：右上角竖排 */}
        <div className="portal-center-text-wrapper">
          {/* Previous text layer (fades out, stays visible during transition) */}
          {previousTextDynasty && (
            <div className="portal-center-text-layer portal-center-text-out">
              <DynastyText dynasty={previousTextDynasty} />
            </div>
          )}
          {/* Current text layer (fades in on top) */}
          <div
            className={`portal-center-text-layer portal-center-text-in${textFadeIn ? " visible" : ""}`}
          >
            <DynastyText dynasty={selectedDynasty} />
          </div>
        </div>
        {/* 穿越按钮：页面中间 */}
        <button
          id="portal-center-cta"
          onClick={handleCtaClick}
          onMouseEnter={() => ctaActive && setWarp(true)}
          onMouseLeave={() => !singularity && setWarp(false)}
          onFocus={() => ctaActive && setWarp(true)}
          onBlur={() => !singularity && setWarp(false)}
          className={`portal-center-cta${ctaActive ? "" : " locked"}${warp && ctaActive ? " portal-cta-warp" : ""}`}
        >
          <span>
            {ctaActive ? (warp ? `穿越·${bookName}` : "立即穿越") : "尚未开启"}
          </span>
          {ctaActive && !warp && (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          )}
        </button>
      </div>

      {/* Scroll Hint */}
      <div className={`portal-scroll-hint${showScrollHint ? "" : " hidden"}`}>
        滚动 · 拖动，逆流穿越历史
      </div>

      {/* Floating Bubble - Circle Mini Program */}
      <FloatingBubble />

      {/* Footer */}
      <div className="portal-footer-minimal">穿越·兰台 TIMESLIP.WORK &copy; 2026</div>

      {/* Bottom Timeline */}
      <div className="portal-timeline-bar">
        <div className="portal-timeline-viewport" ref={viewportRef}>
          <div className="portal-river-line" />
          <div className="portal-center-indicator" />
          <div className="portal-timeline-track" ref={trackRef} style={{ width: `${trackWidth}px` }}>
            {dynasties.map((dynasty, i) => (
              <DynastyNode
                key={dynasty.id}
                dynasty={dynasty}
                isActive={i === activeIndex}
                onClick={() => goToRef.current?.(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
