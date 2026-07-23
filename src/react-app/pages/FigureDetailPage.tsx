import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import { getFigure, getFigureRelations, getFigures } from "../data/api";
import { useApi } from "../hooks/useApi";
import type { FigureDetail, FigureRelation, FigurePassage, FigureAsset, Figure } from "../data/types";
import {
  pickAssetFile,
  sizedAssetUrl,
  fetchFigureBundle,
  mergeBundles,
  localBundleAsFigureBundle,
  type FigureBundle,
} from "../data/figure-assets";
import { FigureSymbol } from "../components/Figure/FigureSymbol";
import { Loading } from "../components/Common/Loading";
import "../components/Figure/figure.css";
import "../components/Figure/figure-game.css";

const LIFE_MAX = 80; // 命途条参考寿命
const NAV_LIST_LIMIT = 500; // 前后切换导航使用的列表大小

// 星级名号（见 docs/PRD_FIGURES_RANKING.md）
const STAR_LABEL: Record<number, string> = {
  5: "千古人物",
  4: "名垂青史",
  3: "载入史册",
  2: "附传偶见",
  1: "史海一粟",
};

const yearShort = (y: number | null) => (y == null ? "年份待考" : y < 0 ? `前${Math.abs(y)}` : `${y}`);
const yearFull = (y: number | null) => (y == null ? "年份待考" : y < 0 ? `公元前 ${Math.abs(y)} 年` : `公元 ${y} 年`);

// 立绘：鼠标 3D 倾斜
function Portrait({ figure, asset }: { figure: FigureDetail; asset?: FigureAsset | null }) {
  const rx = useSpring(0, { stiffness: 120, damping: 16 });
  const ry = useSpring(0, { stiffness: 120, damping: 16 });

  const fullUrl = asset ? sizedAssetUrl(pickAssetFile(asset, "portrait-full"), 896) : null;
  const bustUrl = asset ? sizedAssetUrl(pickAssetFile(asset, "portrait-bust"), 768) : null;
  const avatarUrl = asset ? sizedAssetUrl(pickAssetFile(asset, "avatar"), 320) : null;

  if (asset && (fullUrl || bustUrl)) {
    return (
      <div className="fg-fullscene" style={{ perspective: 1600 }}>
        <motion.div
          className="fg-fullscene-figure"
          style={{ rotateX: rx, rotateY: ry }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            ry.set(((e.clientX - r.left) / r.width - 0.5) * 6);
            rx.set(-((e.clientY - r.top) / r.height - 0.5) * 5);
          }}
          onMouseLeave={() => { rx.set(0); ry.set(0); }}
        >
          <img
            src={fullUrl || bustUrl!}
            alt={figure.name}
            className="fg-fullscene-img"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        </motion.div>
        {avatarUrl && <link rel="preload" as="image" href={avatarUrl} />}
      </div>
    );
  }

  return (
    <div className="fg-stage-portrait" style={{ perspective: 1100 }}>
      <motion.div
        className="fg-portrait"
        style={{ rotateX: rx, rotateY: ry }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 12);
          rx.set(-((e.clientY - r.top) / r.height - 0.5) * 12);
        }}
        onMouseLeave={() => { rx.set(0); ry.set(0); }}
      >
        <FigureSymbol icon={figure.avatar_icon} identity={figure.identity} />
        {figure.avatar_url && (
          <img
            src={figure.avatar_url}
            alt={figure.name}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <span className="fg-corner tl" /><span className="fg-corner tr" />
        <span className="fg-corner bl" /><span className="fg-corner br" />
      </motion.div>
    </div>
  );
}

// 生平历程抽屉
function QuestDrawer({
  open,
  onClose,
  figure,
}: {
  open: boolean;
  onClose: () => void;
  figure: FigureDetail;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const readerHref = (p: FigurePassage) =>
    p.chapter_id
      ? `/read/${p.chapter_id}${p.passage_id ? `?p=${encodeURIComponent(p.passage_id)}` : ""}`
      : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fg-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            className="fg-drawer"
            data-identity={figure.identity}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.36, ease: [0.4, 0, 0.2, 1] }}
            role="dialog"
            aria-label={`${figure.name} 生平历程`}
          >
            <div className="fg-drawer-head">
              <div>
                <span className="fg-drawer-eyebrow">生平历程 · {figure.passages.length} 事</span>
                <h2 className="fg-drawer-title">{figure.name}</h2>
              </div>
              <button className="fg-drawer-close" onClick={onClose} aria-label="关闭">✕</button>
            </div>
            <div className="fg-drawer-body">
              <ol className="fg-timeline">
                {figure.passages.map((p, idx) => {
                  const href = readerHref(p);
                  const Inner = (
                    <>
                      <span className="fg-quest-year">
                        {yearFull(p.year)}
                        {p.location && <span className="fg-quest-loc">· {p.location}</span>}
                      </span>
                      <h3 className="fg-quest-title">{p.title || p.chapter_name}</h3>
                      <p className="fg-quest-text">{p.content}</p>
                      {href && (
                        <span className="fg-quest-link">
                          翻至《{p.book_name}》· 第{p.volume_no}卷 · {p.chapter_name} →
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li className="fg-quest" key={p.passage_id || idx}>
                      <div className="fg-quest-rail"><span className="fg-node" /></div>
                      {href ? (
                        <Link className="fg-quest-card is-link" to={href} onClick={onClose}>
                          {Inner}
                        </Link>
                      ) : (
                        <div className="fg-quest-card">{Inner}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export default function FigureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: figure, loading, error: apiError } = useApi<FigureDetail>(
    () => getFigure(id!),
    [id],
    id ? `/api/figures/${id}` : undefined,
  );
  const { data: relData } = useApi<{ relations: FigureRelation[] }>(
    () => getFigureRelations(id!).catch(() => ({ relations: [] as FigureRelation[] })),
    [id],
    id ? `/api/figures/${id}/relations` : undefined,
  );
  const relations = relData?.relations || [];
  const error = apiError ? (apiError.error?.message || "加载失败") : null;
  const [questOpen, setQuestOpen] = useState(false);
  const [navList, setNavList] = useState<Figure[]>([]);

  const localBundle = useMemo(() => (id ? localBundleAsFigureBundle(id) : null), [id]);
  const [assetBundle, setAssetBundle] = useState<FigureBundle | null>(localBundle);

  useEffect(() => {
    if (!id) return;
    setAssetBundle(localBundleAsFigureBundle(id));
    let cancelled = false;
    fetchFigureBundle(id).then((remote) => {
      if (cancelled) return;
      if (remote) {
        setAssetBundle((prev) => mergeBundles(prev, remote));
      }
    });
    return () => { cancelled = true; };
  }, [id]);

  const defaultAsset: FigureAsset | null = useMemo(() => {
    if (!assetBundle) return null;
    const styleId = assetBundle.defaultStyle;
    return styleId ? assetBundle.assets[styleId] ?? null : null;
  }, [assetBundle]);

  // 拉取人物列表用于前后切换导航（按时序排序）
  useEffect(() => {
    let cancelled = false;
    getFigures({ page: 1, limit: NAV_LIST_LIMIT, sort: "era" })
      .then((res) => { if (!cancelled) setNavList(res.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 切换人物时关闭生平抽屉
  useEffect(() => { setQuestOpen(false); }, [id]);

  // 计算前后人物
  const navIndex = useMemo(() => {
    if (!id || navList.length === 0) return -1;
    return navList.findIndex((f) => f.id === id);
  }, [id, navList]);
  const prevFigure = navIndex > 0 ? navList[navIndex - 1] : null;
  const nextFigure = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;

  const goPrev = useCallback(() => {
    if (prevFigure) navigate(`/figures/${prevFigure.id}`);
  }, [prevFigure, navigate]);
  const goNext = useCallback(() => {
    if (nextFigure) navigate(`/figures/${nextFigure.id}`);
  }, [nextFigure, navigate]);

  // 键盘左右方向键切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (questOpen) return; // 抽屉打开时不切换
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, questOpen]);

  if (loading) return <Loading />;
  if (error) return <div className="figure-detail-error">{error}</div>;
  if (!figure) return null;

  const lifePct =
    figure.death_year != null && figure.birth_year != null
      ? Math.min(100, Math.round(((figure.death_year - figure.birth_year) / LIFE_MAX) * 100))
      : null;
  const lived = lifePct != null ? (figure.death_year as number) - (figure.birth_year as number) : null;
  const titlePlates = figure.aliases?.filter((a) => a.length > 1).slice(0, 4) || [];
  const hasQuests = figure.passages.length > 0;
  const hasFullScene = !!(defaultAsset && (pickAssetFile(defaultAsset, "portrait-full") || pickAssetFile(defaultAsset, "portrait-bust")));

  return (
    <div className="fg fg--stage" data-identity={figure.identity}>
      {(() => {
        const sceneBg = defaultAsset ? pickAssetFile(defaultAsset, "background") : null;
        return (
          <div
            className={`fg-stage${sceneBg ? " has-fullscene" : ""}`}
            style={sceneBg ? ({
              ["--scene-bg" as any]: `url(${sceneBg})`,
            } as React.CSSProperties) : undefined}
          >
            <Link to="/figures" className="fg-back">
              <span className="fg-back-arrow" aria-hidden="true">‹</span> 返回群英谱
            </Link>

            <motion.div
              className="fg-stage-art"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <Portrait figure={figure} asset={defaultAsset} />
              {/* 全屏立绘模式：姓名+星级放在立绘左下 */}
              {hasFullScene && (
                <div className="fg-stage-caption on-fullscene">
                  <div className="fg-stage-eyebrow">青史人物 · {figure.identity}</div>
                  <h1 className="fg-stage-name">{figure.name}</h1>
                  {figure.star >= 1 && (
                    <div className="fg-stage-star" data-star={figure.star}>
                      <span className="fg-star-marks" aria-hidden="true">
                        {"★".repeat(figure.star)}
                        <span className="fg-star-empty">{"★".repeat(5 - figure.star)}</span>
                      </span>
                      <span className="fg-star-label">{STAR_LABEL[figure.star]}</span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            <motion.div
              className="fg-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            >
          {!hasFullScene && <div className="fg-eyebrow">青史人物 · {figure.identity}</div>}
          {!hasFullScene && <h1 className="fg-name">{figure.name}</h1>}
          {!hasFullScene && figure.star >= 1 && (
            <div className="fg-star" data-star={figure.star} title={`综合等级 ${figure.star} 星`}>
              <span className="fg-star-marks" aria-hidden="true">
                {"★".repeat(figure.star)}
                <span className="fg-star-empty">{"★".repeat(5 - figure.star)}</span>
              </span>
              <span className="fg-star-label">{STAR_LABEL[figure.star]}</span>
            </div>
          )}

          {titlePlates.length > 0 && (
            <div className="fg-titles">
              {titlePlates.map((a) => <span key={a} className="fg-title-plate">{a}</span>)}
            </div>
          )}

          <div className="fg-badges">
            <span className="fg-badge is-identity">{figure.identity}</span>
            <span className="fg-badge is-dynasty">{figure.dynasty}</span>
          </div>

          {figure.bio_summary && <p className="fg-bio-dark">{figure.bio_summary}</p>}

          {figure.keyword_tags?.length > 0 && (
            <div className="fg-tags-dark">
              {figure.keyword_tags.slice(0, 6).map((t) => (
                <span key={t} className="fg-tag-dark">{t}</span>
              ))}
            </div>
          )}

          {lifePct != null && (
            <div className="fg-life">
              <div className="fg-life-label">
                <span>命途 · {yearShort(figure.birth_year)} — {yearShort(figure.death_year)}</span>
                <span>享年 {lived}</span>
              </div>
              <div className="fg-life-track">
                <div
                  className="fg-life-fill"
                  style={{ width: `${lifePct}%` }}
                />
              </div>
            </div>
          )}

          <div className="fg-actions">
            <button
              className="fg-act is-primary"
              onClick={() => setQuestOpen(true)}
              disabled={!hasQuests}
              title={hasQuests ? undefined : "此人物由机器抽取，史料待补录"}
            >
              <span className="fg-act-icon" aria-hidden="true">史</span>
              生平历程
              {hasQuests && <span className="fg-act-count">{figure.passages.length}</span>}
            </button>
            {relations.length > 0 && (
              <Link className="fg-act is-ghost" to={`/figures?view=graph&focus=${figure.id}`}>
                <span className="fg-act-icon" aria-hidden="true">联</span>
                人物关系
                <span className="fg-act-count">{relations.length}</span>
              </Link>
            )}
          </div>
        </motion.div>

            {/* 左右切换按钮 */}
            <button
              className="fg-nav-btn fg-nav-prev"
              onClick={goPrev}
              disabled={!prevFigure}
              aria-label={prevFigure ? `上一位：${prevFigure.name}` : "已是第一位"}
              title={prevFigure ? prevFigure.name : "已是第一位"}
            >
              <span className="fg-nav-arrow" aria-hidden="true">‹</span>
            </button>
            <button
              className="fg-nav-btn fg-nav-next"
              onClick={goNext}
              disabled={!nextFigure}
              aria-label={nextFigure ? `下一位：${nextFigure.name}` : "已是最后一位"}
              title={nextFigure ? nextFigure.name : "已是最后一位"}
            >
              <span className="fg-nav-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        );
      })()}

      <QuestDrawer open={questOpen} onClose={() => setQuestOpen(false)} figure={figure} />
    </div>
  );
}
