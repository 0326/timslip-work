import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
} from "react";

/**
 * 全局音频引擎
 *
 * 管理整站音频：
 * 1. BGM — loop 循环，全站持续播放，低音量；按页面动态切换曲目
 * 2. hover 提示音 — Web Audio API 合成 blip，供任意页面调用
 * 3. 静音状态 — localStorage 持久化，全站共享
 *
 * BGM 在 App 顶层创建，路由切换时不中断。
 * 页面通过 useBgm(url) 设置自己的 BGM，切换时自动淡出→换曲→淡入。
 * 主页漩涡激活时通过 duckBgm() 临时压低 BGM 让位漩涡音效。
 */

const STORAGE_KEY = "timslip-audio-muted";

const DEFAULT_BGM = "/assets/audio/mainpage.mp3";

// 音量配置 — 低音量，不喧宾夺主
const VOL_BGM = 0.2;
const VOL_BLIP = 0.08;

interface AudioContextValue {
  muted: boolean;
  setMuted: (m: boolean) => void;
  playHoverBlip: () => void;
  /** 临时压低/恢复 BGM（主页漩涡激活时调用） */
  duckBgm: (duck: boolean) => void;
  /** 切换 BGM 曲目（淡出→换曲→淡入），可指定该页音量 */
  setBgm: (url: string, volume?: number) => void;
}

const AudioStoreContext = createContext<AudioContextValue | null>(null);

export function useAudio() {
  const ctx = useContext(AudioStoreContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}

/** 页面级 hook：设置当前页面的 BGM，组件卸载时不自动恢复（由下一个页面的 useBgm 接管） */
export function useBgm(url: string, volume?: number) {
  const { setBgm } = useAudio();
  useEffect(() => {
    setBgm(url, volume);
  }, [url, volume, setBgm]);
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const duckedRef = useRef(false);
  const bgmUrlRef = useRef(DEFAULT_BGM);
  const pendingUrlRef = useRef<string | null>(null);
  const switchingRef = useRef(false);
  const bgmVolumeRef = useRef(VOL_BGM);
  const switchTokenRef = useRef(0);
  const fadeCancelRef = useRef<(() => void) | null>(null);

  const [muted, setMutedState] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );
  const mutedRef = useRef(muted);
  const startedRef = useRef(false);

  // hover blip 防抖
  const lastBlipRef = useRef(0);

  // --- 初始化 BGM ---
  useEffect(() => {
    const bgm = new Audio(DEFAULT_BGM);
    bgm.loop = true;
    bgm.volume = 0;
    bgm.preload = "auto";
    bgmRef.current = bgm;

    return () => {
      bgm.pause();
      bgm.src = "";
      // 不关闭 AudioContext：HMR 重新挂载时 ref 仍指向旧 ctx，
      // close 后 playHoverBlip 无法创建新 ctx（ref 非 null 检查通过但 ctx 已死）
    };
  }, []);

  // --- BGM 目标音量（综合静音和 duck 状态）---
  const getTargetVolume = useCallback(() => {
    if (mutedRef.current) return 0;
    if (duckedRef.current) return 0;
    return bgmVolumeRef.current;
  }, []);

  // --- BGM 淡入/淡出（支持完成回调，用于切曲）---
  // 每次调用自动取消之前未完成的 fade，确保同一时刻只有一个 fade 循环在运行
  const fadeBgmTo = useCallback((target: number, onDone?: () => void) => {
    fadeCancelRef.current?.();
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      const bgm = bgmRef.current;
      if (!bgm) { onDone?.(); return; }
      const v = bgm.volume;
      const diff = target - v;
      if (Math.abs(diff) < 0.01) {
        bgm.volume = target;
        if (target === 0 && !bgm.paused) bgm.pause();
        onDone?.();
        return;
      }
      bgm.volume = v + diff * 0.12;
      requestAnimationFrame(step);
    };
    step();
    fadeCancelRef.current = () => { cancelled = true; };
  }, []);

  // --- 启动 BGM ---
  const startBgm = useCallback(() => {
    if (startedRef.current) return;
    const bgm = bgmRef.current;
    if (!bgm || mutedRef.current) return;
    bgm
      .play()
      .then(() => {
        startedRef.current = true;
        fadeBgmTo(getTargetVolume());
      })
      .catch(() => {
        // 浏览器阻止自动播放，等待交互
      });
  }, [fadeBgmTo, getTargetVolume]);

  // --- 进入页面即尝试播放 + 首次交互 fallback ---
  useEffect(() => {
    startBgm();

    const onFirstInteraction = () => {
      if (startedRef.current) {
        window.removeEventListener("pointerdown", onFirstInteraction);
        window.removeEventListener("wheel", onFirstInteraction, true);
        window.removeEventListener("keydown", onFirstInteraction);
        return;
      }
      startBgm();
    };
    window.addEventListener("pointerdown", onFirstInteraction);
    window.addEventListener("wheel", onFirstInteraction, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", onFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("wheel", onFirstInteraction, true);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, [startBgm]);

  // --- 播放 hover 提示音（木质感动效音：三角波 + 低通滤波，中低频快速衰减）---
  const playHoverBlip = useCallback(() => {
    if (mutedRef.current) return;
    const now = performance.now();
    if (now - lastBlipRef.current < 80) return; // 防抖：80ms 内只播一次
    lastBlipRef.current = now;

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    // 木质感合成：三角波（含自然奇次谐波）经低通滤波器柔化高频，
    // 频率从 520Hz 微降至 380Hz 模拟敲击衰减，2ms 快速起音 + 100ms 指数衰减
    const playBlip = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.05);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1000, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.1);
      filter.Q.value = 1.2;

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(VOL_BLIP, ctx.currentTime + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(playBlip).catch(() => {});
      return;
    }

    playBlip();
  }, []);

  // --- 临时压低/恢复 BGM（主页漩涡用）---
  const duckBgm = useCallback(
    (duck: boolean) => {
      duckedRef.current = duck;
      const bgm = bgmRef.current;
      if (!duck && bgm && bgm.paused && !mutedRef.current && !switchingRef.current) {
        // 恢复时如果 BGM 已暂停（被静音或 duck 到 0 后暂停），重新播放
        bgm
          .play()
          .then(() => fadeBgmTo(getTargetVolume()))
          .catch(() => {});
      } else {
        fadeBgmTo(getTargetVolume());
      }
    },
    [fadeBgmTo, getTargetVolume],
  );

  // --- 切换 BGM 曲目（淡出→换曲→淡入）---
  const setBgm = useCallback(
    (url: string, volume?: number) => {
      // 未指定音量时重置为默认值，避免继承上一页的低音量
      bgmVolumeRef.current = volume ?? VOL_BGM;

      // URL 已加载 → 只调整音量
      if (bgmUrlRef.current === url) {
        pendingUrlRef.current = null;
        fadeBgmTo(getTargetVolume());
        return;
      }
      // 正在切换到同一个 URL → 更新音量但不干扰正在进行的 fade-out
      if (pendingUrlRef.current === url) {
        return;
      }

      // 新的切换：递增 token 使旧 callback 失效
      const token = ++switchTokenRef.current;
      pendingUrlRef.current = url;
      const bgm = bgmRef.current;
      if (!bgm) return;

      switchingRef.current = true;
      // 淡出当前 BGM，完成后切换音源并淡入
      fadeBgmTo(0, () => {
        // 如果在 fade-out 期间又触发了新的切换，放弃本次操作
        if (token !== switchTokenRef.current) return;
        // 延迟到实际切换 src 时才更新 bgmUrlRef
        bgmUrlRef.current = url;
        pendingUrlRef.current = null;
        bgm.src = url;
        bgm.load();
        if (!mutedRef.current) {
          bgm
            .play()
            .then(() => {
              if (token !== switchTokenRef.current) return;
              switchingRef.current = false;
              fadeBgmTo(getTargetVolume());
            })
            .catch(() => {
              if (token !== switchTokenRef.current) return;
              switchingRef.current = false;
            });
        } else {
          switchingRef.current = false;
        }
      });
    },
    [fadeBgmTo, getTargetVolume],
  );

  // --- 静音切换 ---
  const setMuted = useCallback(
    (m: boolean) => {
      setMutedState(m);
      mutedRef.current = m;
      localStorage.setItem(STORAGE_KEY, m ? "1" : "0");
      if (m) {
        fadeBgmTo(0);
      } else {
        const bgm = bgmRef.current;
        if (bgm) {
          if (bgm.paused) {
            bgm
              .play()
              .then(() => fadeBgmTo(getTargetVolume()))
              .catch(() => {});
          } else {
            fadeBgmTo(getTargetVolume());
          }
        }
      }
    },
    [fadeBgmTo, getTargetVolume],
  );

  return (
    <AudioStoreContext.Provider value={{ muted, setMuted, playHoverBlip, duckBgm, setBgm }}>
      {children}
    </AudioStoreContext.Provider>
  );
}
