import { useEffect, useState } from "react";
import { getFigureAssets } from "../data/api";
import type { FigureAssetsResponse } from "../data/types";

/**
 * 懒加载人物视觉资产（头像/立绘/背景/多风格）。
 * 列表页不调用，避免 N+1；人物详情页或卡片 hover 时按需调用。
 */
export function useFigureAssets(figureId: string | null | undefined) {
  const [data, setData] = useState<FigureAssetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!figureId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFigureAssets(figureId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.error?.message || "加载资产失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [figureId]);

  return { data, loading, error };
}
