import { useRef, useEffect } from "react";
import { toCanvas } from "html-to-image";

interface ImplosionCanvasProps {
  /** 翻为 true 即开始：截图 → 隐藏页面 → 像素粒子吸入 → onDone */
  active: boolean;
  /** 吸入塌缩总时长（ms） */
  duration?: number;
  /** 动效播完回调（用于跳转） */
  onDone: () => void;
}

interface PixelParticle {
  r0: number; // 初始半径（到洞心）
  theta0: number; // 初始角度
  px: number; // 上一帧屏幕坐标（画墨尾用）
  py: number;
  size: number;
  r: number; // 像素红
  g: number;
  b: number;
  da: number; // 初始角度扰动（打散网格对齐）
  curl: number; // 旋入圈数（个体差异 → 散开成漩涡尘）
  sp: number; // 速度因子
  delay: number; // 起始延迟（外圈略晚 + 随机）
}

const PARTICLE_CAP = 16000;

/**
 * 像素级"湮灭吸入"：把整页栅格化为一张位图，按网格采样成携带真实颜色的粒子，
 * 全部绑定到同一根时钟、沿对数螺旋加速坠入唯一洞心（朱砂核），并拖出水墨墨尾。
 * 保证所有粒子在 P=1 时收束到中心，不会半空猝灭。
 */
export function ImplosionCanvas({ active, duration = 1800, onDone }: ImplosionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    // 注意：不要用跨调用的 startedRef 守卫 —— StrictMode 会双调用 effect，
    // 首调用的 cleanup 会取消运行，若守卫挡住第二（存活）调用就永远不跑。
    // 改为每次 effect 各自用局部 cancelled，存活的那次自然跑完。
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const root = document.querySelector(".timslip-portal") as HTMLElement | null;
    if (!root) {
      doneRef.current();
      return;
    }

    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 洞心 = 按钮中心
    const cta = document.getElementById("portal-center-cta");
    const cr = cta?.getBoundingClientRect();
    const cx = cr ? cr.left + cr.width / 2 : W / 2;
    const cy = cr ? cr.top + cr.height / 2 : H / 2;

    let raf = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      doneRef.current();
    };

    if (reduce) {
      // 减少动态：直接快速淡黑后跳转
      root.classList.add("is-imploding");
      let a = 0;
      const fade = () => {
        a = Math.min(1, a + 0.08);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = `rgba(8,7,6,${a})`;
        ctx.fillRect(0, 0, W, H);
        if (a < 1) raf = requestAnimationFrame(fade);
        else finish();
      };
      fade();
      return () => {
        cancelAnimationFrame(raf);
      };
    }

    let cancelled = false;
    const particles: PixelParticle[] = [];
    let maxR0 = 1;

    // 截图兜底：失败或超时则走"快速淡黑 → 跳转"，绝不卡死用户
    const fallbackFade = () => {
      root.classList.add("is-imploding");
      let a = 0;
      const fade = () => {
        a = Math.min(1, a + 0.06);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = `rgba(8,7,6,${a})`;
        ctx.fillRect(0, 0, W, H);
        if (a < 1) raf = requestAnimationFrame(fade);
        else finish();
      };
      fade();
    };

    const buildAndRun = async () => {
      // 只排除自身覆盖层与环境画布；保留背景图 → 山水/龙纹的墨迹也化作墨尘。
      // 纸面（米白）像素在采样阶段跳过，只让"墨"升腾入洞。
      const SKIP = [
        "portal-implosion-canvas",
        "portal-singularity-flash",
        "portal-vortex-canvas",
        "portal-river-canvas",
      ];
      let snap: HTMLCanvasElement;
      try {
        const timeout = new Promise<never>((_, rej) =>
          window.setTimeout(() => rej(new Error("snapshot-timeout")), 1500),
        );
        snap = await Promise.race([
          toCanvas(root, {
            pixelRatio: 1,
            filter: (node: HTMLElement) =>
              !SKIP.some((c) => node.classList?.contains?.(c)),
          }),
          timeout,
        ]);
      } catch {
        if (!cancelled) fallbackFade();
        return;
      }
      if (cancelled) return;

      // 元素吸入次序：先标题、再导航、再时间轴、最后背景 → "一个个被吸入"
      // 注意：在隐藏页面前取各元素矩形
      const ORDER: Array<[string, number]> = [
        [".portal-center-text-wrapper", 0.0], // 史书标题/描述
        [".site-header", 0.14], // 顶部导航
        [".portal-scroll-hint", 0.14],
        [".portal-footer-minimal", 0.22],
        [".portal-timeline-bar", 0.3], // 底部时间轴/朝代
      ];
      const regions = ORDER.map(([sel, d]) => {
        const el = root.querySelector(sel) as HTMLElement | null;
        return el ? { rect: el.getBoundingClientRect(), d } : null;
      }).filter(Boolean) as Array<{ rect: DOMRect; d: number }>;
      const REST_DELAY = 0.46; // 其余（背景山水/龙纹）最后被吸入
      const delayFor = (x: number, y: number): number => {
        for (const rg of regions) {
          const r = rg.rect;
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return rg.d;
        }
        return REST_DELAY;
      };

      // 不再瞬隐整页！改为逐元素湮灭：真实元素按次序淡出（CSS .portal-suck），
      // 各元素的粒子只在轮到自己时才出现并飞向洞心 → 灭霸响指式渐次粒子化。
      root.classList.add("portal-suck");

      // 采样像素 → 粒子
      const sctx = snap.getContext("2d");
      if (!sctx) {
        finish();
        return;
      }
      const sw = snap.width;
      const sh = snap.height;
      const img = sctx.getImageData(0, 0, sw, sh).data;
      const sx = sw / W; // 截图像素 → 屏幕坐标比例（pixelRatio=1 时≈1）
      const sy = sh / H;
      // 细网格采样；只保留"墨"（暗或有彩），跳过米白纸面 → 不再是满屏网点
      const step = 5;
      for (let gy = 0; gy < sh && particles.length < PARTICLE_CAP; gy += step) {
        for (let gx = 0; gx < sw && particles.length < PARTICLE_CAP; gx += step) {
          const idx = (gy * sw + gx) * 4;
          const a = img[idx + 3];
          if (a < 24) continue; // 透明
          const cr = img[idx];
          const cg = img[idx + 1];
          const cb = img[idx + 2];
          const lum = 0.3 * cr + 0.59 * cg + 0.11 * cb;
          const sat = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);
          // 保留墨迹/彩点（深色或饱和），跳过纸面（亮且寡淡）
          if (lum > 208 && sat < 40) continue;
          const px = gx / sx;
          const py = gy / sy;
          const dx = px - cx;
          const dy = py - cy;
          const r0 = Math.hypot(dx, dy);
          if (r0 > maxR0) maxR0 = r0;
          particles.push({
            r0,
            theta0: Math.atan2(dy, dx),
            px,
            py,
            size: step * (0.8 + Math.random() * 0.6),
            r: cr,
            g: cg,
            b: cb,
            da: (Math.random() - 0.5) * 0.9,
            curl: 1.0 + Math.random() * 2.4,
            sp: 0.75 + Math.random() * 0.6,
            // 按所属元素分配吸入次序 + 小抖动（同一元素内也有先后）
            delay: delayFor(px, py) + Math.random() * 0.08,
          });
        }
      }

      ctx.lineCap = "round";
      const start = performance.now();
      const render = (now: number) => {
        // 必须夹到 [0,1]：rAF 时间戳偶尔略早于 start → 负 P，
        // Math.pow(负, 小数) = NaN → createRadialGradient 抛错会打断整个动画。
        const P = Math.max(0, Math.min((now - start) / duration, 1));
        ctx.clearRect(0, 0, W, H);

        // 暗盘：早期保持很小（让逐个吸入的元素仍可见），末段急速吞没全屏
        const maxDim = Math.max(W, H);
        const darkR = 20 + Math.pow(P, 3) * maxDim * 1.6;
        const holeR = 8 + Math.pow(P, 2.4) * maxDim * 0.5;
        const dg = ctx.createRadialGradient(cx, cy, 0, cx, cy, darkR);
        dg.addColorStop(0, "rgba(8,7,6,1)");
        dg.addColorStop(0.55, "rgba(8,7,6,0.9)");
        dg.addColorStop(1, "rgba(8,7,6,0)");
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(cx, cy, darkR, 0, Math.PI * 2);
        ctx.fill();

        // 粒子：轮到自己（P≥delay）才出现并坠入；之前完全不画 → 露出正在淡出的真实元素
        const SPAN = 0.5; // 每个元素从启动到没入洞心的时长占比
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (P <= p.delay) continue; // 尚未轮到：不画粒子，真实元素仍可见
          const lp = Math.max(0, Math.min(1, (P - p.delay) / SPAN));
          const e = lp * lp * (3 - 2 * lp); // smoothstep，先缓后急再收
          const acc = e * e; // 再叠一层 → 末段猛吸
          const r = p.r0 * (1 - acc);
          const theta = p.theta0 + p.da + p.curl * (0.6 + 2.2 * e) * p.sp;
          const nx = cx + Math.cos(theta) * r;
          const ny = cy + Math.sin(theta) * r;

          // 透明度：刚剥离时淡入（与真实元素淡出衔接）+ 临近洞心淡出 + 被暗盘吞没
          let alpha = 0.92 * Math.min(1, lp / 0.12);
          if (r < 90) alpha *= r / 90;
          if (r < holeR) alpha *= 0.15;
          if (P > 0.82) alpha *= Math.max(0, 1 - (P - 0.82) / 0.18);

          if (alpha > 0.02) {
            ctx.strokeStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
            ctx.lineWidth = Math.max(0.6, p.size * (1 - acc * 0.45));
            ctx.beginPath();
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(nx, ny);
            ctx.stroke();
          }
          p.px = nx;
          p.py = ny;
        }

        // 朱砂核（在粒子之上，保持中心一点红）
        const coreR = 5 + P * 14;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6);
        cg.addColorStop(0, `rgba(217,72,58,${0.45 + P * 0.35})`);
        cg.addColorStop(0.5, `rgba(194,58,43,${0.22 * (1 - P * 0.5)})`);
        cg.addColorStop(1, "rgba(194,58,43,0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
        ctx.fill();

        // 末段全屏压暗，衔接跳转
        if (P > 0.72) {
          const k = (P - 0.72) / 0.28;
          ctx.fillStyle = `rgba(8,7,6,${k * k})`;
          ctx.fillRect(0, 0, W, H);
        }

        if (P < 1) {
          raf = requestAnimationFrame(render);
        } else {
          finish();
        }
      };
      raf = requestAnimationFrame(render);
    };

    buildAndRun();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, duration]);

  return <canvas ref={canvasRef} className="portal-implosion-canvas" />;
}
