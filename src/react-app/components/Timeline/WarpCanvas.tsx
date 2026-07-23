import { useRef, useEffect } from "react";

/**
 * 空间扭曲：hover 按钮时，用 WebGL 把背景图实时"漩涡 + 引力透镜"扭曲，
 * 围绕按钮中心旋拧、向心收束，强度随 hover 淡入淡出（intensity）。
 * 画布透明度 = intensity：未 hover 时全透明（露出真实背景），
 * hover 时扭曲版渐显盖住真实背景 → 旋涡粒子背后的空间也跟着被搅动。
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uImg;
uniform vec2 uCenter;
uniform float uIntensity;
uniform float uTime;
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // 左上原点像素
  vec2 d = frag - uCenter;
  float dist = length(d);
  float R = max(uRes.x, uRes.y) * 0.58;
  float fall = smoothstep(R, 0.0, dist);          // 远 0 → 近心 1
  // 持续慢速旋转（uTime 项 → hover 期间无限旋转）+ 向心扭拧；负号与粒子旋向一致
  float ang = -uIntensity * (1.9 * fall + uTime * 0.22);
  float lens = 1.0 - uIntensity * 0.34 * fall;    // 引力透镜向心收束
  float s = sin(ang), c = cos(ang);
  vec2 rd = vec2(d.x * c - d.y * s, d.x * s + d.y * c) * lens;
  vec2 src = uCenter + rd;
  // cover 映射：屏幕像素 → 背景图 uv（保持等比裁切）
  float scale = max(uRes.x / uImg.x, uRes.y / uImg.y);
  vec2 draw = uImg * scale;
  vec2 off = (uRes - draw) * 0.5;
  vec2 uv = clamp((src - off) / draw, 0.0, 1.0);
  vec3 col = texture2D(uTex, uv).rgb;
  // 漩涡区整体压暗 + 提点对比，让上层墨色粒子更突出、更像黑洞把空间卷暗
  float vign = smoothstep(R * 1.05, R * 0.1, dist);        // 越近心越强
  col = (col - 0.5) * (1.0 + 0.18 * uIntensity) + 0.5;     // 轻微提对比
  col *= mix(1.0, 0.42, vign * uIntensity);                // 向心压暗
  // 事件视界：最中心近黑
  float core = smoothstep(R * 0.14, 0.0, dist) * uIntensity;
  col = mix(col, vec3(0.05, 0.04, 0.04), core);
  gl_FragColor = vec4(col, uIntensity);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

export function WarpCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
    if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uImg = gl.getUniformLocation(prog, "uImg");
    const uCenter = gl.getUniformLocation(prog, "uCenter");
    const uIntensity = gl.getUniformLocation(prog, "uIntensity");
    const uTime = gl.getUniformLocation(prog, "uTime");

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

    let imgW = 1;
    let imgH = 1;
    let lastSrc = "";

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // 上传当前显示的背景图为纹理（切换朝代时 src 变 → 重传）
    const syncTexture = () => {
      const img = document.querySelector(
        ".portal-bg-image-current img",
      ) as HTMLImageElement | null;
      if (!img || !img.complete || !img.naturalWidth) return;
      const src = img.currentSrc || img.src;
      if (src === lastSrc) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        imgW = img.naturalWidth;
        imgH = img.naturalHeight;
        lastSrc = src;
      } catch {
        /* 图未就绪，下一帧再试 */
      }
    };

    let intensity = 0;
    let frame = 0;
    let cleared = false;
    const start = performance.now();
    const loop = () => {
      const cta = document.getElementById("portal-center-cta");
      const warp = !!cta && cta.classList.contains("portal-cta-warp");
      intensity += ((warp ? 1 : 0) - intensity) * 0.08;

      if (intensity < 0.01) {
        // 未 hover：清空一次即透明，省去逐帧绘制
        if (!cleared) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          cleared = true;
        }
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      cleared = false;

      if (frame++ % 15 === 0) syncTexture();
      const cr = cta?.getBoundingClientRect();
      const cx = cr ? cr.left + cr.width / 2 : canvas.width / 2;
      const cy = cr ? cr.top + cr.height / 2 : canvas.height / 2;

      gl.useProgram(prog);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uImg, imgW, imgH);
      gl.uniform2f(uCenter, cx, cy);
      gl.uniform1f(uIntensity, Math.min(1, intensity));
      gl.uniform1f(uTime, (performance.now() - start) * 0.001);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafRef.current = requestAnimationFrame(loop);
    };
    syncTexture();
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="portal-warp-canvas" />;
}
