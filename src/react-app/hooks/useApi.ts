import { useState, useEffect, useCallback } from "react";
import { peekCache } from "../data/api";
import type { ApiError } from "../data/types";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * 通用 fetch hook，管理 data / loading / error 状态。
 * fetcher 为返回 Promise 的函数；deps 变化时自动重新请求。
 *
 * 传入 cacheKey 时启用 SWR 模式：
 * - 首次挂载同步读取缓存，有缓存则 data 立即可用、loading 为 false
 * - 后台静默 revalidate，更新后替换数据
 * - 无缓存时与普通模式一致（loading: true）
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  cacheKey?: string,
): UseApiState<T> {
  const [data, setData] = useState<T | null>(() =>
    cacheKey ? (peekCache<T>(cacheKey) ?? null) : null,
  );
  const [loading, setLoading] = useState(() =>
    cacheKey ? !peekCache<T>(cacheKey) : true,
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // 序列化 deps，仅当其内容真正变化时才触发重新请求。
  // 避免调用方每次渲染传入新数组引用（[...deps]）导致 effect 反复执行。
  // 约束：deps 只能包含可序列化值（string/number/boolean/null），
  // 传入函数、Symbol 或循环引用会导致序列化异常或 key 丢失。
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    // 有缓存时不闪 loading，后台静默 revalidate
    const hasCache = cacheKey ? !!peekCache<T>(cacheKey) : false;
    if (!hasCache) setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, nonce, cacheKey]);

  return { data, loading, error, refetch };
}
