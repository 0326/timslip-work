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
function annotate(content: string, glosses: Gloss[] | null | undefined): (string | { term: string; gloss: Gloss })[] {
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
  return parts;
}

/**
 * 在已标注的段落中，把划线文本包裹为 <mark> 节点。
 * 划线标记为深朱红色实线下划线，覆盖注释虚线，但注释词仍标红。
 *
 * 核心思路：重建原文，在全文中定位划线区间，再按 part 边界切分渲染，
 * 从而正确处理划线横跨注释词边界的情形。
 */
function applyHighlights(
  parts: (string | { term: string; gloss: Gloss })[],
  highlightTexts: string[],
): ReactNode[] {
  if (!highlightTexts || highlightTexts.length === 0) {
    return parts.map((p, i) => {
      if (typeof p === "string") return <span key={i}>{p}</span>;
      return <GlossTerm key={i} term={p.term} gloss={p.gloss} />;
    });
  }

  // 重建原文，记录每个 part 在全文中的起止位置
  let fullText = "";
  const partRanges: { start: number; end: number; part: string | { term: string; gloss: Gloss } }[] = [];
  for (const part of parts) {
    const text = typeof part === "string" ? part : part.term;
    const start = fullText.length;
    fullText += text;
    partRanges.push({ start, end: fullText.length, part });
  }

  // 在全文中搜索所有划线文本的位置
  const ranges: { start: number; end: number }[] = [];
  for (const ht of highlightTexts) {
    let from = 0;
    while (from <= fullText.length - ht.length) {
      const idx = fullText.indexOf(ht, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + ht.length });
      from = idx + 1;
    }
  }

  // 无匹配则原样渲染
  if (ranges.length === 0) {
    return parts.map((p, i) => {
      if (typeof p === "string") return <span key={i}>{p}</span>;
      return <GlossTerm key={i} term={p.term} gloss={p.gloss} />;
    });
  }

  // 合并重叠区间
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    if (merged.length > 0 && r.start < merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  /** 判断某位置区间是否落在划线内 */
  const isInRange = (s: number, e: number) =>
    merged.some((r) => r.start < e && r.end > s);

  const result: ReactNode[] = [];
  let keyIdx = 0;

  for (const { start: pStart, end: pEnd, part } of partRanges) {
    const isGloss = typeof part !== "string";

    if (!isInRange(pStart, pEnd)) {
      // 该 part 无划线覆盖
      if (isGloss) {
        result.push(<GlossTerm key={keyIdx++} term={part.term} gloss={part.gloss} />);
      } else {
        result.push(<span key={keyIdx++}>{part}</span>);
      }
      continue;
    }

    if (isGloss) {
      // 注释词被划线覆盖：用 <mark> 包裹，实线覆盖虚线，注释词仍标红可悬浮
      result.push(
        <mark key={keyIdx++} className="lt-highlight-mark">
          <GlossTerm term={part.term} gloss={part.gloss} />
        </mark>,
      );
    } else {
      // 纯文本段：按划线区间切分
      let cursor = pStart;
      for (const r of merged) {
        const rStart = Math.max(r.start, pStart);
        const rEnd = Math.min(r.end, pEnd);
        if (rStart >= rEnd || rStart < cursor) continue;
        // 划线前的普通文本
        if (rStart > cursor) {
          result.push(<span key={keyIdx++}>{fullText.slice(cursor, rStart)}</span>);
        }
        // 划线文本
        result.push(
          <mark key={keyIdx++} className="lt-highlight-mark">
            {fullText.slice(rStart, rEnd)}
          </mark>,
        );
        cursor = rEnd;
      }
      // 末尾剩余文本
      if (cursor < pEnd) {
        result.push(<span key={keyIdx++}>{fullText.slice(cursor, pEnd)}</span>);
      }
    }
  }

  return result;
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
  /** 划线文本列表（在原文中显示深朱红色实线下划线） */
  highlights?: string[];
}

/**
 * 带词条标注的原文渲染器。
 *
 * 在 PassageView（单段原文）与 ReaderPage（篇章阅读）中复用，
 * 将原文中命中的 gloss term 渲染为虚线下划线标注，
 * 悬浮 / 点击展示注音（拼音）与释义。
 *
 * 若传入 highlights，则对应文本段会显示为深朱红色实线下划线（划线笔记），
 * 划线实线覆盖注释虚线，但注释词仍保持标红。
 */
export function GlossText({ content, glosses, highlights }: GlossTextProps) {
  const parts = annotate(content, glosses);
  const nodes = applyHighlights(parts, highlights || []);
  return <>{nodes}</>;
}
