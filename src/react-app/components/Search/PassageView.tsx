import { useState } from "react";
import type { Passage, Gloss } from "../../data/types";

interface PassageViewProps {
  passage: Passage;
}

type Column = "original" | "annotation" | "vernacular";

export function PassageView({ passage }: PassageViewProps) {
  const [visibleCols, setVisibleCols] = useState<Record<Column, boolean>>({
    original: true,
    annotation: !!passage.annotation,
    vernacular: !!passage.vernacular,
  });

  const toggleCol = (col: Column) => {
    setVisibleCols((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  // Render original text with gloss terms highlighted
  const renderOriginal = () => {
    if (!passage.glosses || passage.glosses.length === 0) {
      return passage.content;
    }
    // Sort terms by length descending to match longer terms first
    const terms = [...passage.glosses].sort((a, b) => b.term.length - a.term.length);
    let parts: (string | { term: string; gloss: Gloss })[] = [passage.content];
    for (const g of terms) {
      const newParts: (string | { term: string; gloss: Gloss })[] = [];
      for (const part of parts) {
        if (typeof part !== "string") {
          newParts.push(part);
          continue;
        }
        const idx = part.indexOf(g.term);
        if (idx === -1) {
          newParts.push(part);
          continue;
        }
        if (idx > 0) newParts.push(part.slice(0, idx));
        newParts.push({ term: g.term, gloss: g });
        const rest = part.slice(idx + g.term.length);
        if (rest) newParts.push(rest);
      }
      parts = newParts;
    }
    return parts.map((p, i) => {
      if (typeof p === "string") return <span key={i}>{p}</span>;
      return (
        <mark
          key={i}
          className="passage-gloss-term"
          title={p.gloss.text}
        >
          {p.term}
        </mark>
      );
    });
  };

  return (
    <div className="passage-view">
      <div className="passage-view-toggles">
        <button
          className={`passage-toggle${visibleCols.original ? " active" : ""}`}
          onClick={() => toggleCol("original")}
        >
          原文
        </button>
        {passage.annotation && (
          <button
            className={`passage-toggle${visibleCols.annotation ? " active" : ""}`}
            onClick={() => toggleCol("annotation")}
          >
            注释
          </button>
        )}
        {passage.vernacular && (
          <button
            className={`passage-toggle${visibleCols.vernacular ? " active" : ""}`}
            onClick={() => toggleCol("vernacular")}
          >
            白话
          </button>
        )}
      </div>
      <div className="passage-view-columns">
        {visibleCols.original && (
          <div className="passage-column passage-column-original">
            <p className="passage-text">{renderOriginal()}</p>
          </div>
        )}
        {visibleCols.annotation && passage.annotation && (
          <div className="passage-column passage-column-annotation">
            <p className="passage-text">{passage.annotation}</p>
          </div>
        )}
        {visibleCols.vernacular && passage.vernacular && (
          <div className="passage-column passage-column-vernacular">
            <p className="passage-text">{passage.vernacular}</p>
          </div>
        )}
      </div>
      {/* Gloss tooltip list */}
      {passage.glosses && passage.glosses.length > 0 && (
        <div className="passage-glosses">
          <h3 className="passage-glosses-title">词条</h3>
          <dl className="passage-glosses-list">
            {passage.glosses.map((g, i) => (
              <div key={i} className="passage-gloss-item">
                <dt>{g.term}</dt>
                <dd>{g.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
