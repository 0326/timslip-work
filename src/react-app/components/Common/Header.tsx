import { Link, useLocation } from "react-router-dom";
import UserMenu from "../Auth/UserMenu";
import { useAudio } from "../../store/audioStore";
import { MuteToggle } from "./MuteToggle";

const NAV_LINKS = [
  { to: "/", label: "穿越" },
  { to: "/search", label: "兰台" },
  { to: "/figures", label: "人物" },
  { to: "/atlas", label: "舆图" },
  { to: "/circle", label: "下载" },
  { to: "/about", label: "关于" },
];

/** 路由 chunk 预加载映射（hover 时触发，空闲预加载的补充） */
const ROUTE_CHUNKS: Record<string, () => Promise<unknown>> = {
  "/search": () => import("../../pages/SearchPage"),
  "/figures": () => import("../../pages/FigurePage"),
  "/atlas": () => import("../../pages/AtlasPage"),
  "/circle": () => import("../../pages/CirclePage"),
  "/about": () => import("../../pages/AboutPage"),
};

export function Header() {
  const location = useLocation();
  const { muted, setMuted } = useAudio();
  return (
    <nav className="site-header">
      <Link to="/" className="site-header-brand">
        <img src="/logo/logo-256.png" alt="" className="site-header-logo" />
        穿越·兰台
        <span className="en">TIMESLIP.WORK</span>
      </Link>
      <div className="site-header-right">
        <ul className="site-header-links">
          {NAV_LINKS.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className={location.pathname === link.to ? "active" : ""}
                onMouseEnter={() => ROUTE_CHUNKS[link.to]?.()}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <MuteToggle muted={muted} onToggle={() => setMuted(!muted)} />
        <UserMenu />
      </div>
    </nav>
  );
}
