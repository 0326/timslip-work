import { useTimeline } from "../hooks/useTimeline";
import { useIsMobile } from "../hooks/useMediaQuery";
import { Loading } from "../components/Common/Loading";
import { Timeline } from "../components/Timeline/Timeline";
import { TimelineMobile } from "../components/Timeline/TimelineMobile";

export default function Home() {
  const { data, loading, error, refetch } = useTimeline();
  const isMobile = useIsMobile();

  if (loading) return <Loading />;
  if (error || !data) {
    return (
      <div className="site-error">
        <h1>数据加载失败</h1>
        <p>{error?.error.message || "无法获取时间轴数据"}</p>
        <button onClick={refetch}>重试</button>
      </div>
    );
  }

  return isMobile ? <TimelineMobile data={data} /> : <Timeline data={data} />;
}
