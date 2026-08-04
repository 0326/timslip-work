import { useState, useEffect, useCallback } from "react";

/**
 * 人物收藏 hook —— 基于 localStorage 本地持久化
 *
 * 存储格式：`timslip-figure-favorites` = JSON 数组（人物 ID 字符串）
 * 跨组件/标签页同步：监听 `storage` 事件 + 自定义 `timslip-favorites-change` 事件
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

export function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(() => readFavs());

  useEffect(() => {
    const sync = () => setFavs(readFavs());
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    // 基于当前 favs 直接计算新值，副作用（writeFavs + dispatchEvent）在 setFavs 外执行，
    // 避免 React 18 StrictMode 双调用 updater 导致 toggle 互相抵消。
    const next = new Set(favs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeFavs(next);
    setFavs(next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }, [favs]);

  const isFavorite = useCallback((id: string) => favs.has(id), [favs]);

  return { isFavorite, toggleFavorite, favorites: favs };
}
