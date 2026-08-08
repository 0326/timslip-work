import { useState, useEffect, useCallback, useRef } from "react";
import { getSave, patchSave } from "../services/authClient";
import type { Highlight, SaveConflictError } from "../types/auth";

/**
 * 划线笔记 hook —— 基于云端存档（work_saves.highlights）
 *
 * 数据结构：highlights = { [bookId]: Highlight[] }
 * 读写模式：加载时读整档；写入时用 PATCH 字段级合并，只回传 highlights 子集，
 *           避免每次都全量下载/上传整个存档（含阅读进度、收藏等无关字段）。
 */
export function useHighlights(isAuthenticated: boolean) {
  const [highlights, setHighlights] = useState<Record<string, Highlight[]>>({});
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number | undefined>(undefined);

  // 从云端加载全部划线
  const loadHighlights = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSave();
      versionRef.current = res.version;
      if (res.exists && res.save?.highlights) {
        setHighlights(res.save.highlights);
      } else {
        setHighlights({});
      }
    } catch {
      setHighlights({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadHighlights();
    else { setHighlights({}); setLoading(false); }
  }, [isAuthenticated, loadHighlights]);

  /** 字段级写回划线：只合并 highlights 字段，保留其余数据 */
  const writeHighlights = useCallback(
    async (newHighlights: Record<string, Highlight[]>): Promise<boolean> => {
      try {
        const res = await patchSave({ highlights: newHighlights }, Date.now(), "default", versionRef.current);
        versionRef.current = res.version;
        return true;
      } catch (err) {
        const conflict = err as SaveConflictError;
        if (conflict.error === "conflict") {
          // 冲突：重新加载最新数据。不自动重试写入——PATCH 是字段级浅合并，
          // 直接重试可能覆盖其他设备新增的划线。回滚乐观更新，让用户在最新数据上重试。
          await loadHighlights();
        }
        return false;
      }
    },
    [loadHighlights],
  );

  /** 添加划线 */
  const addHighlight = useCallback(
    async (hl: Omit<Highlight, "id" | "createdAt">): Promise<boolean> => {
      const full: Highlight = {
        ...hl,
        id: `${hl.bookId}-${hl.chapterId}-${hl.passageId}-${Date.now()}`,
        createdAt: Date.now(),
      };
      const bookKey = hl.bookId;
      const existing = highlights[bookKey] || [];
      // 去重：同一段落同一文本不重复添加
      if (existing.some((h) => h.text === full.text && h.passageId === full.passageId)) {
        return false;
      }
      const newHighlights = {
        ...highlights,
        [bookKey]: [...existing, full],
      };
      setHighlights(newHighlights); // 乐观更新
      const ok = await writeHighlights(newHighlights);
      if (!ok) setHighlights(highlights); // 回滚
      return ok;
    },
    [highlights, writeHighlights],
  );

  /** 删除划线 */
  const removeHighlight = useCallback(
    async (highlightId: string, bookId: string): Promise<boolean> => {
      const existing = highlights[bookId] || [];
      const newHighlights = {
        ...highlights,
        [bookId]: existing.filter((h) => h.id !== highlightId),
      };
      // 如果该书已无划线，删除空键
      if (newHighlights[bookId].length === 0) {
        delete newHighlights[bookId];
      }
      setHighlights(newHighlights);
      const ok = await writeHighlights(newHighlights);
      if (!ok) setHighlights(highlights);
      return ok;
    },
    [highlights, writeHighlights],
  );

  /** 获取某书的划线列表 */
  const getBookHighlights = useCallback(
    (bookId: string): Highlight[] => highlights[bookId] || [],
    [highlights],
  );

  /** 获取所有有划线的书 ID */
  const bookIds = Object.keys(highlights);

  /** 总划线数 */
  const totalCount = Object.values(highlights).reduce((s, arr) => s + arr.length, 0);

  return {
    highlights,
    loading,
    loadHighlights,
    addHighlight,
    removeHighlight,
    getBookHighlights,
    bookIds,
    totalCount,
  };
}
