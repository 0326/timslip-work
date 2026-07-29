import { useState, useRef, useEffect, type ReactNode } from "react";
import type { Gloss } from "../../data/types";
import "./gloss.css";

/**
 * 将原文按 gloss 词条切分，返回带标注的节点数组。
 *
 * - 按 term 长度降序匹配，优先标注更长的词组（如「大将军」优先于「将军」）。
 * - 首次出现唯一标注：同一 term 在一段原文中只标注第一次出现。
 * - 已标注的片段不会被后续更短的 term 二次切分。
 */
function annotate(content: string, glosses: Gloss[] | null | undefined): ReactNode[] {
  if (!glosses || glosses.length === 0) {
    return [content];
  }
  const terms = [...glosses].sort((a, b) => b.term.length - a.term.length);
  let parts: (string | { term: string; gloss: Gloss })[] = [content];
  for (const g of terms) {
    if (!g.term) continue;
    const newParts: (string | { term: string; gloss: Gloss })[] = [];
    let matched = false; // 只标注第一次出现
    for (const part of parts) {
      // 已标注节点原样保留，避免短词拆分长词标注
      if (typeof part !== "string") {
        newParts.push(part);
        continue;
      }
      if (!matched) {
        const idx = part.indexOf(g.term);
        if (idx !== -1) {
          if (idx > 0) newParts.push(part.slice(0, idx));
          newParts.push({ term: g.term, gloss: g });
          const rest = part.slice(idx + g.term.length);
          if (rest) newParts.push(rest);
          matched = true;
          continue;
        }
      }
      newParts.push(part);
    }
    parts = newParts;
  }
  return parts.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{p}</span>;
    return <GlossTerm key={i} term={p.term} gloss={p.gloss} />;
  });
}

/**
 * 单个标注词条：原文下方虚线标记，悬浮/点击展示注音与释义。
 *
 * - 桌面：鼠标悬浮显示 tooltip，移出后短暂延迟隐藏（避免边缘闪烁）。
 * - 移动端：点击切换显隐，点击外部自动关闭。
 */
function GlossTerm({ term, gloss }: { term: string; gloss: Gloss }) {
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    window.clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const scheduleHide = () => {
    hideTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  // 点击外部关闭（移动端 / 桌面点击切换后点别处关闭）
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  // 智能定位：上方空间不够（含导航栏 80px 避让）时显示在下方
  useEffect(() => {
    if (!open || !tooltipRef.current || !wrapRef.current) return;
    const termRect = wrapRef.current.getBoundingClientRect();
    const tooltipH = tooltipRef.current.offsetHeight;
    // 导航栏高度约 76px，额外留 16px 间距
    const NAV_RESERVE = 92;
    const spaceAbove = termRect.top - NAV_RESERVE;
    setBelow(spaceAbove < tooltipH + 8);
  }, [open]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return (
    <span
      className="gloss-term"
      ref={wrapRef}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      {term}
      {open && (
        <span
          className={`gloss-tooltip${below ? " below" : ""}`}
          role="tooltip"
          ref={tooltipRef}
        >
          {gloss.pinyin && (
            <span className="gloss-tooltip-pinyin">{gloss.pinyin}</span>
          )}
          <span className="gloss-tooltip-text">{gloss.text}</span>
        </span>
      )}
    </span>
  );
}

interface GlossTextProps {
  /** 原文正文 */
  content: string;
  /** 词条列表（生僻字词 / 特殊名词注释），无则原样输出 */
  glosses?: Gloss[] | null;
}

/**
 * 带词条标注的原文渲染器。
 *
 * 在 PassageView（单段原文）与 ReaderPage（篇章阅读）中复用，
 * 将原文中命中的 gloss term 渲染为虚线下划线标注，
 * 悬浮 / 点击展示注音（拼音）与释义。
 */
export function GlossText({ content, glosses }: GlossTextProps) {
  return <>{annotate(content, glosses)}</>;
}
