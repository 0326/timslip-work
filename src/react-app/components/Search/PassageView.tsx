import { useState } from "react";
import type { Passage } from "../../data/types";
import { GlossText } from "../Common/GlossText";

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
            <p className="passage-text">
              <GlossText content={passage.content} glosses={passage.glosses} />
            </p>
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
