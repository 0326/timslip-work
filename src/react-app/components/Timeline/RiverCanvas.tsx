import { useRef, useEffect } from "react";

/**
 * 历史长河粒子（FRONTEND_ARCH §4.3）。
 * 墨色粒子沿水平方向自右向左流动，象征"逆流穿越"；3 层视差：
 *   layer 0 远（近地平线 / 慢 / 淡 / 灰褐）
 *   layer 1 中（河面主体 / 中速 / 淡墨）
 *   layer 2 近（屏幕下缘 / 快 / 浓 / 墨黑）
 * Canvas 2D，粒子量 <300。尊重 prefers-reduced-motion：仅绘制一帧静态墨痕。
 */

interface RiverParticle {
  x: number;
  y: number;
  vx: number; // 水平速度（负值=向左）
  size: number;
  len: number; // 水平拉伸（流痕长度）
  opacity: number;
  layer: 0 | 1 | 2;
}

/* 预渲染一个柔和墨点，drawImage 横向拉伸成流痕，远比逐帧画渐变便宜。 */
function makeSprite(rgb: string): HTMLCanvasElement {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.5, `rgba(${rgb},0.4)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

const LAYERS = [
  // band: 粒子集中的垂直区间（占视口高度比例）；speed/size/len/opacity 区间
  { band: [0.4, 0.6], speed: [0.2, 0.45], size: [0.7, 1.3], len: [6, 10], opacity: [0.06, 0.13], spriteIdx: 0 },
  { band: [0.55, 0.82], speed: [0.5, 0.95], size: [1.1, 2.1], len: [7, 13], opacity: [0.1, 0.2], spriteIdx: 1 },
  { band: [0.72, 1.04], speed: [1.0, 1.85], size: [1.7, 3.0], len: [9, 18], opacity: [0.14, 0.28], spriteIdx: 1 },
] as const;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function RiverCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<RiverParticle[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // sprite[0] 远山灰褐（空气感），sprite[1] 墨色
    const sprites = [makeSprite("138,126,110"), makeSprite("26,26,26")];

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const spawn = (atRightEdge: boolean): RiverParticle => {
      const layer = (Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2) as 0 | 1 | 2;
      const L = LAYERS[layer];
      return {
        x: atRightEdge ? width + rand(0, width * 0.3) : rand(0, width),
        y: rand(L.band[0], L.band[1]) * height,
        vx: -rand(L.speed[0], L.speed[1]),
        size: rand(L.size[0], L.size[1]),
        len: rand(L.len[0], L.len[1]),
        opacity: rand(L.opacity[0], L.opacity[1]),
        layer,
      };
    };

    const targetCount = Math.min(280, Math.floor((width * height) / 9000));

    const init = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      particlesRef.current = [];
      for (let i = 0; i < targetCount; i++) particlesRef.current.push(spawn(false));
    };

    const draw = (p: RiverParticle) => {
      const sprite = sprites[LAYERS[p.layer].spriteIdx];
      const w = p.size * p.len;
      const h = p.size * 3;
      ctx.globalAlpha = p.opacity;
      ctx.drawImage(sprite, p.x - w / 2, p.y - h / 2, w, h);
    };

    let frame = 0;
    const update = () => {
      ctx.clearRect(0, 0, width, height);
      const arr = particlesRef.current;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        p.x += p.vx;
        p.y += Math.sin((frame + i * 13) * 0.01) * 0.08 * (p.layer + 1); // 水流起伏
        draw(p);
        if (p.x < -p.size * p.len) arr[i] = spawn(true);
      }
      ctx.globalAlpha = 1;
      frame++;
      rafRef.current = requestAnimationFrame(update);
    };

    const onResize = () => init();
    window.addEventListener("resize", onResize);
    init();

    if (reduce) {
      for (const p of particlesRef.current) draw(p); // 静态一帧
      ctx.globalAlpha = 1;
    } else {
      update();
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="portal-river-canvas" />;
}
