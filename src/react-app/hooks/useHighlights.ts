import { useState, useEffect, useCallback, useRef } from "react";
import { getSave, putSave } from "../services/authClient";
import type { Highlight, WorkSaveData, SaveConflictError } from "../types/auth";

/**
 * 划线笔记 hook —— 基于云端存档（work_saves.highlights）
 *
 * 数据结构：highlights = { [bookId]: Highlight[] }
 * 读写模式：每次操作都读取最新存档 → 修改 highlights 字段 → 写回（带版本冲突检测）
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

  /** 写回云端存档（仅修改 highlights 字段，保留其余数据） */
  const writeHighlights = useCallback(
    async (newHighlights: Record<string, Highlight[]>): Promise<boolean> => {
      try {
        const res = await getSave();
        const saveData: WorkSaveData = res.exists && res.save ? res.save : {};
        const newSave: WorkSaveData = {
          ...saveData,
          highlights: newHighlights,
        };
        await putSave(newSave, Date.now(), "default", res.version);
        versionRef.current = (res.version ?? 0) + 1;
        return true;
      } catch (err) {
        const conflict = err as SaveConflictError;
        if (conflict.error === "conflict") {
          // 冲突：重新加载后重试一次
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
