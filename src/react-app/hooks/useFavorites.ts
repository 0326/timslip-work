import { useState, useEffect, useCallback } from "react";

/**
 * 人物收藏 hook —— 基于 localStorage 本地持久化的模块级单例
 *
 * 存储格式：`timslip-figure-favorites` = JSON 数组（人物 ID 字符串）
 *
 * 设计说明：
 * - 收藏状态提升为模块级单例（favs + 订阅者集合），所有组件共享同一份 Set，
 *   避免每个组件各自持有独立状态导致的跨组件不一致与无谓重渲染。
 * - 跨标签页同步：监听 `storage` 事件。
 * - 本标签页内同步：单例内置订阅者列表，toggle 后通知所有订阅者。
 */

const STORAGE_KEY = "timslip-figure-favorites";
const CHANGE_EVENT = "timslip-favorites-change";

function readFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeFavs(favs: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favs]));
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}

// ── 模块级单例状态 ──
let singletonFavs: Set<string> = readFavs();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function toggleFav(id: string) {
  const next = new Set(singletonFavs);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  singletonFavs = next;
  writeFavs(next);
  // 本标签页通知订阅者 + 同步给其它标签页
  notify();
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(singletonFavs);

  useEffect(() => {
    // 本标签页：toggleFav 已更新 singletonFavs，直接同步到 React state（无需重读 localStorage）
    const syncLocal = () => setFavs(singletonFavs);
    // 跨标签页：从 localStorage 重新读取（其他标签页的写入只反映在 storage 事件中）
    const syncStorage = () => {
      singletonFavs = readFavs();
      setFavs(singletonFavs);
    };
    listeners.add(syncLocal);
    window.addEventListener("storage", syncStorage);
    window.addEventListener(CHANGE_EVENT, syncLocal);
    return () => {
      listeners.delete(syncLocal);
      window.removeEventListener("storage", syncStorage);
      window.removeEventListener(CHANGE_EVENT, syncLocal);
    };
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    toggleFav(id);
  }, []);

  const isFavorite = useCallback((id: string) => singletonFavs.has(id), []);

  return { isFavorite, toggleFavorite, favorites: favs };
}