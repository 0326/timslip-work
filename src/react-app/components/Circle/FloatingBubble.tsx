import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./circle.css";

const QINGYUE_IMG =
  "https://asset.timeslip.work/assets/figures/qingyue/classical/portrait/full-tease.png";

const LINES = [
  "主人，我是你的系统：青月~",
  "快来 [穿越兰台圈] 小程序",
  "跟青月和古人一起做朋友吧",
];

const TYPING_SPEED = 65;
const DISPLAY_DURATION = 3200;
const PAUSE_BEFORE_NEXT = 600;

export function FloatingBubble() {
  const navigate = useNavigate();
  const [lineIndex, setLineIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [phase, setPhase] = useState<"typing" | "display" | "pause">("typing");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const currentLine = LINES[lineIndex];

  const advance = useCallback(() => {
    setPhase("display");
    timerRef.current = setTimeout(() => {
      setPhase("pause");
      timerRef.current = setTimeout(() => {
        setLineIndex((i) => (i + 1) % LINES.length);
        setCharCount(0);
        setPhase("typing");
      }, PAUSE_BEFORE_NEXT);
    }, DISPLAY_DURATION);
  }, []);

  useEffect(() => {
    if (phase !== "typing") return;
    if (charCount >= currentLine.length) {
      timerRef.current = setTimeout(advance, 200);
      return;
    }
    timerRef.current = setTimeout(() => {
      setCharCount((c) => c + 1);
    }, TYPING_SPEED);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, charCount, currentLine.length, advance]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const displayedText = currentLine.slice(0, charCount);
  const isTyping = phase === "typing" && charCount < currentLine.length;

  return (
    <div
      className="circle-float"
      role="button"
      tabIndex={0}
      onClick={() => navigate("/circle")}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate("/circle");
      }}
    >
      <img
        className="circle-float-avatar"
        src={QINGYUE_IMG}
        alt="青月"
        draggable={false}
      />
      <div className="circle-float-bubble">
        <span className="circle-float-bubble-text">
          {displayedText}
          {isTyping && <span className="circle-float-cursor" />}
        </span>
      </div>
    </div>
  );
}
