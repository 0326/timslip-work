import { useRef, useEffect } from "react";

/**
 * 水墨旋涡：一组持久的对数螺旋臂（像 logo 的几道墨笔），整体缓慢旋转；
 * 粒子是螺旋臂上的采样点，画成柔和墨团 + 沿切向的墨尾 → 连续的水墨笔触感。
 * hover（按钮 .portal-cta-warp）时旋臂向心收紧、转速加快、墨尾拉长、朱砂核变亮，
 * 形成"被吸入黑洞"的趋势。中心常驻朱砂红点，呼应 logo。
 */

const ARMS = 6; // 旋臂数（logo 的几道墨笔）
const PER_ARM = 230; // 每臂粒子数
const TWIST = 2.2; // 对数螺旋扭率

interface ArmParticle {
  arm: number;
  s: number; // 沿臂位置 0(外)→1(内)
  jR: number; // 半径抖动（墨笔毛糙）
  jA: number; // 角度抖动
  size: number;
  gray: number; // 0 浓墨 → 1 淡灰
  alpha: number;
}

// 沿臂的明暗/粗细分布：中段最浓最粗，两端收细（像运笔的提按）
function bell(s: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, s)));
}

export function VortexCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let rOuter = Math.max(width, height) * 0.46;

    const particles: ArmParticle[] = [];
    const build = () => {
      particles.length = 0;
      for (let a = 0; a < ARMS; a++) {
        for (let i = 0; i < PER_ARM; i++) {
          const s = i / PER_ARM;
          const b = bell(s);
          particles.push({
            arm: a,
            s,
            jR: (Math.random() - 0.5) * 14,
            jA: (Math.random() - 0.5) * 0.18,
            size: 6 + b * 18 + Math.random() * 5,
            gray: Math.max(0, 0.55 - b * 0.5 + (Math.random() - 0.5) * 0.25),
            alpha: 0.05 + b * 0.1 + Math.random() * 0.04,
          });
        }
      }
    };

    let cx = width / 2;
    let cy = height / 2;
    const updateTarget = () => {
      const cta = document.getElementById("portal-center-cta");
      if (cta) {
        const r = cta.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      } else {
        cx = width / 2;
        cy = height / 2;
      }
    };

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      rOuter = Math.max(width, height) * 0.46;
      updateTarget();
    };
    resize();
    build();

    let intensity = 0; // 0 静态旋涡 → 1 黑洞吸入
    let phase = 0;
    let frame = 0;

    const update = () => {
      ctx.clearRect(0, 0, width, height);
      if (frame++ % 12 === 0) updateTarget();

      const cta = document.getElementById("portal-center-cta");
      const warp = !!cta && cta.classList.contains("portal-cta-warp");
      intensity += ((warp ? 1 : 0) - intensity) * 0.08;

      // 旋转相位持续推进（仅在可见时才有意义）
      phase += 0.0022 * (1 + intensity * 2.5);

      // 仅在 hover（intensity>0）时显示旋涡；未 hover 则全清空、不绘制
      if (intensity < 0.012) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const armStep = (Math.PI * 2) / ARMS;
      const pull = 1 - 0.46 * intensity; // hover 时整体半径收紧

      // 把每条旋臂的采样点连成连续锥形墨带（中粗两端细），两层叠出墨晕
      for (let a = 0; a < ARMS; a++) {
        let px = 0,
          py = 0,
          pw = 0,
          pv = 0,
          pa = 0,
          has = false;
        for (let i = 0; i < PER_ARM; i++) {
          const p = particles[a * PER_ARM + i];
          const baseR = rOuter * Math.exp(-2.4 * p.s);
          const r = baseR * pull + p.jR;
          const theta = a * armStep + TWIST * Math.log(baseR + 1) + phase + p.jA;
          const x = cx + Math.cos(theta) * r;
          const y = cy + Math.sin(theta) * r;

          const b = bell(p.s);
          const v = Math.round(18 + p.gray * 150);
          const width = (3 + b * 12) * (1 + intensity * 0.9);
          // 整体不透明度随 hover 强度淡入淡出
          let alpha = p.alpha * Math.min(1, intensity * 1.5) * 1.4;
          if (r < 64) alpha *= Math.max(0, r / 64); // 近中心淡出，避免糊死

          if (has && r > 3) {
            const mw = (pw + width) / 2;
            const ma = (pa + alpha) / 2;
            const mv = Math.round((pv + v) / 2);
            // 外层：宽而淡 → 墨晕
            ctx.strokeStyle = `rgba(${mv},${mv},${mv},${ma * 0.26})`;
            ctx.lineWidth = mw * 1.6;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            ctx.stroke();
            // 内层：窄而浓 → 笔芯
            ctx.strokeStyle = `rgba(${mv},${mv},${mv},${Math.min(1, ma * 0.8)})`;
            ctx.lineWidth = Math.max(0.6, mw * 0.55);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          px = x;
          py = y;
          pw = width;
          pv = v;
          pa = alpha;
          has = r > 3;
        }
      }

      // 朱砂核（logo 中心红点）— 随 hover 强度淡入
      const coreA = intensity * 0.8;
      const coreR = 6 + intensity * 9;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.6);
      cg.addColorStop(0, `rgba(217,72,58,${Math.min(1, coreA + 0.2)})`);
      cg.addColorStop(0.4, `rgba(194,58,43,${coreA})`);
      cg.addColorStop(1, "rgba(194,58,43,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, intensity * 0.85);
      ctx.fillStyle = "#c23a2b";
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(update);
    };

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    if (!reduce) update();

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="portal-vortex-canvas" />;
}
