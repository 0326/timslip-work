import { useState, useEffect } from "react";
import { search as searchApi } from "../data/api";
import { useApi } from "./useApi";
import type { SearchResponse, ApiError } from "../data/types";

interface UseSearchState {
  data: SearchResponse | null;
  loading: boolean;
  error: ApiError | null;
}

export function useSearch(
  query: string,
  opts?: { book?: string; page?: number; limit?: number },
): UseSearchState {
  const debouncedQuery = useDebounce(query, 300);
  const { book = "", page = 1, limit = 20 } = opts ?? {};

  const { data, loading, error } = useApi<SearchResponse>(
    () =>
      debouncedQuery.trim()
        ? searchApi(debouncedQuery, { book, page, limit })
        : Promise.resolve({
            query: debouncedQuery,
            total: 0,
            page,
            limit,
            results: [],
          }),
    [debouncedQuery, book, page, limit],
  );

  return { data, loading, error };
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
