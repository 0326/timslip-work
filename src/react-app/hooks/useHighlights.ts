import { useState, useEffect, useCallback, useRef } from "react";
import { getSave, patchSave } from "../services/authClient";
import type { Highlight, SaveConflictError } from "../types/auth";

/**
 * 合并 pending 与服务端最新划线：按 id 去重合并，保留服务端新增的划线，
 * 避免在冲突重试时用 pending 覆盖其他端/其他字段新增的数据。
 */
function mergeHighlights(
  base: Record<string, Highlight[]>,
  pending: Record<string, Highlight[]>,
): Record<string, Highlight[]> {
  const merged: Record<string, Highlight[]> = { ...base };
  for (const bookId of Object.keys(pending)) {
    const byId = new Map((base[bookId] || []).map((h) => [h.id, h]));
    for (const h of pending[bookId] || []) byId.set(h.id, h);
    merged[bookId] = [...byId.values()];
  }
  return merged;
}

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
  // 始终指向最新 highlights 的引用：乐观更新时同步写入，保证快速连续划线读到累计数据，避免丢失
  const highlightsRef = useRef<Record<string, Highlight[]>>({});
  // 写队列：将 patchSave 串行化，杜绝并发提交使用同一陈旧 expectedVersion 导致的 409 冲突
  const writeQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));

  /** 同步更新 state 与 ref，保证 ref 始终即时的最新值 */
  const setHighlightsBoth = useCallback((next: Record<string, Highlight[]>) => {
    highlightsRef.current = next;
    setHighlights(next);
  }, []);

  // 从云端加载全部划线
  const loadHighlights = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSave();
      versionRef.current = res.version;
      setHighlightsBoth(res.exists && res.save?.highlights ? res.save.highlights : {});
    } catch {
      setHighlightsBoth({});
    } finally {
      setLoading(false);
    }
  }, [setHighlightsBoth]);

  useEffect(() => {
    if (isAuthenticated) loadHighlights();
    else { setHighlightsBoth({}); setLoading(false); }
  }, [isAuthenticated, loadHighlights, setHighlightsBoth]);

  /** 字段级写回划线：只合并 highlights 字段，保留其余数据（串行入队 + 冲突自动重试） */
  const writeHighlights = useCallback(
    (newHighlights: Record<string, Highlight[]>): Promise<boolean> => {
      // 排队执行：前一次写完成后再提交下一次，保证每次读取到最新 version
      const task = writeQueueRef.current.then(async () => {
        let pending = newHighlights;
        // 冲突通常由其他字段（如阅读进度自动保存）推进共享 version 导致，
        // 重新拉取服务端并合并后重试，避免「刷新后第一次保存失败」。
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await patchSave({ highlights: pending }, Date.now(), "default", versionRef.current);
            versionRef.current = res.version;
            return true;
          } catch (err) {
            const isConflict = (err as SaveConflictError)?.error === "conflict";
            // 非冲突错误：同步服务端后放弃
            if (!isConflict) {
              await loadHighlights();
              return false;
            }
            // 冲突：重新同步服务端，将 pending 合入最新划线后重试
            await loadHighlights();
            pending = mergeHighlights(highlightsRef.current, pending);
          }
        }
        return false;
      });
      // 无论本次成功与否都让队列继续推进，避免异常中断后续写入
      writeQueueRef.current = task.catch(() => false);
      return task;
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
      const current = highlightsRef.current;
      const existing = current[bookKey] || [];
      // 去重：同一段落同一文本不重复添加
      if (existing.some((h) => h.text === full.text && h.passageId === full.passageId)) {
        return false;
      }
      const newHighlights = {
        ...current,
        [bookKey]: [...existing, full],
      };
      setHighlightsBoth(newHighlights); // 乐观更新
      return writeHighlights(newHighlights);
    },
    [writeHighlights, setHighlightsBoth],
  );

  /** 删除划线 */
  const removeHighlight = useCallback(
    async (highlightId: string, bookId: string): Promise<boolean> => {
      const current = highlightsRef.current;
      const existing = current[bookId] || [];
      const newHighlights = {
        ...current,
        [bookId]: existing.filter((h) => h.id !== highlightId),
      };
      // 如果该书已无划线，删除空键
      if (newHighlights[bookId].length === 0) {
        delete newHighlights[bookId];
      }
      setHighlightsBoth(newHighlights);
      return writeHighlights(newHighlights);
    },
    [writeHighlights, setHighlightsBoth],
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
