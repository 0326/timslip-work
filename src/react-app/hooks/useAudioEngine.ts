import { useRef, useEffect, useCallback } from "react";
import { useAudio } from "../store/audioStore";

/**
 * 主页专用音效引擎（BGM 已由全局 AudioProvider 管理）
 *
 * 仅管理主页特有的交互音效：
 * 1. 漩涡音效（Vortex Rising）— loop，hover CTA 时淡入并 duck 全局 BGM，离开恢复
 * 2. 点击音效（through）— 一次性，点击穿越按钮瞬间播放
 * 3. 朝代切换提示音 — Web Audio 合成 blip，滚动切换朝代时播放（带防抖）
 *
 * 静音状态由全局 AudioProvider 管理，此处同步读取。
 */

const VORTEX_URL = "/assets/audio/Vortex_Rising.mp3";
const CLICK_URL = "/assets/audio/through.mp3";

const VOL_VORTEX = 0.32;
const VOL_CLICK = 0.42;
const VOL_BLIP = 0.1;

// 淡入淡出 lerp 系数（与 VortexCanvas 的 intensity lerp 同步）
const FADE_RATE = 0.08;

export function useAudioEngine() {
  const { muted, duckBgm } = useAudio();

  const vortexRef = useRef<HTMLAudioElement | null>(null);
  const clickRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const mutedRef = useRef(muted);

  // 漩涡激活状态
  const vortexActiveRef = useRef(false);

  // 漩涡音量 lerp 状态
  const vortexVolRef = useRef(0);
  const vortexTargetRef = useRef(0);
  const vortexRafRef = useRef<number | null>(null);

  // 朝代切换 blip 防抖
  const lastBlipRef = useRef(0);

  // --- 同步静音状态 ---
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // --- 初始化音频元素（漩涡 + 点击，BGM 由全局管理）---
  useEffect(() => {
    const vortex = new Audio(VORTEX_URL);
    vortex.loop = true;
    vortex.volume = 0;
    vortex.preload = "auto";
    vortexRef.current = vortex;

    const click = new Audio(CLICK_URL);
    click.volume = VOL_CLICK;
    click.preload = "auto";
    clickRef.current = click;

    return () => {
      vortex.pause();
      click.pause();
      if (vortexRafRef.current) cancelAnimationFrame(vortexRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // --- 漩涡音量 lerp 循环 ---
  const startVortexLoop = useCallback(() => {
    if (vortexRafRef.current) return;
    const loop = () => {
      const cur = vortexVolRef.current;
      const tgt = vortexTargetRef.current;
      const next =
        Math.abs(tgt - cur) < 0.005 ? tgt : cur + (tgt - cur) * FADE_RATE;
      vortexVolRef.current = next;

      const v = vortexRef.current;
      if (v) {
        v.volume = next * VOL_VORTEX * (mutedRef.current ? 0 : 1);
        if (next < 0.01 && !v.paused) {
          v.pause();
        }
      }

      if (Math.abs(tgt - next) > 0.005 || next > 0.005) {
        vortexRafRef.current = requestAnimationFrame(loop);
      } else {
        vortexRafRef.current = null;
      }
    };
    vortexRafRef.current = requestAnimationFrame(loop);
  }, []);

  // --- 设置漩涡激活状态（hover CTA 时调用）---
  // 激活时：duck 全局 BGM → 漩涡淡入；关闭时：漩涡淡出 → 恢复全局 BGM
  const setVortexActive = useCallback(
    (active: boolean) => {
      vortexActiveRef.current = active;
      const v = vortexRef.current;

      if (active) {
        if (v && v.paused && !mutedRef.current) {
          v.play().catch(() => {});
        }
        // duck 全局 BGM 让位漩涡
        duckBgm(true);
      } else {
        // 恢复全局 BGM
        duckBgm(false);
      }

      vortexTargetRef.current = active ? 1 : 0;
      startVortexLoop();
    },
    [duckBgm, startVortexLoop],
  );

  // --- 播放点击音效（穿越按钮点击瞬间）---
  const playClick = useCallback(() => {
    if (mutedRef.current) return;
    const click = clickRef.current;
    if (click) {
      click.currentTime = 0;
      click.play().catch(() => {});
    }
  }, []);

  // --- 播放朝代切换提示音（Web Audio 合成 blip，带防抖）---
  const playDynastyBlip = useCallback(() => {
    if (mutedRef.current) return;
    const now = performance.now();
    if (now - lastBlipRef.current < 80) return; // 防抖：80ms 内只播一次
    lastBlipRef.current = now;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(VOL_BLIP, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }, []);

  return {
    setVortexActive,
    playClick,
    playDynastyBlip,
  };
}
