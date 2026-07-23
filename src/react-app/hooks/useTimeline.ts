import { useApi } from "./useApi";
import { getTimeline } from "../data/api";
import type { TimelineData } from "../data/types";

export function useTimeline() {
  return useApi<TimelineData>(getTimeline, [], "/api/timeline");
}
