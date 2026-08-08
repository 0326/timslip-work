import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { WechatQrcodeModal } from "../components/Figure/WechatQrcodeModal";
import { useAudio, useBgm } from "../store/audioStore";
import { useFavorites } from "../hooks/useFavorites";
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

// 收藏按钮（星星，作为 flex 子项与首行内容底边对齐）
function FigureFavButton({ figureId, figureName }: { figureId: string; figureName: string }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { playHoverBlip } = useAudio();
  const active = isFavorite(figureId);
  return (
    <button
      type="button"
      className={`fg-fav-btn${active ? " is-active" : ""}`}
      onClick={() => toggleFavorite(figureId)}
      onMouseEnter={playHoverBlip}
      aria-pressed={active}
      aria-label={active ? `取消收藏 ${figureName}` : `收藏 ${figureName}`}
      title={active ? "取消收藏" : "收藏"}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M12 2.6l2.95 6.18 6.55.78-4.85 4.6 1.27 6.64L12 18.2l-5.92 2.6 1.27-6.64-4.85-4.6 6.55-.78z"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// 立绘：鼠标 3D 倾斜
function Portrait({ figure, asset }: { figure: FigureDetail; asset?: FigureAsset | null }) {
  const rx = useSpring(0, { stiffness: 120, damping: 16 });
  const ry = useSpring(0, { stiffness: 120, damping: 16 });

  const fullUrl = asset ? sizedAssetUrl(pickAssetFile(asset, "portrait-full"), 896) : null;
  const bustUrl = asset ? sizedAssetUrl(pickAssetFile(asset, "portrait-bust"), 768) : null;
  const avatarUrl = asset ? sizedAssetUrl(pickAssetFile(asset, "avatar"), 320) : null;
  const highRarity = figure.star >= 4;

  if (highRarity && asset && (fullUrl || bustUrl)) {
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
      ? `/read/${p.chapter_id}${p.passage_id ? `?p=${encodeURIComponent(p.passage_id)}&from=figure` : ""}`
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
  const [searchParams] = useSearchParams();
  const fromFavorites = searchParams.get("from") === "favorites";
  const navSort = (searchParams.get("sort") as "era" | "star") || "star";
  const { favorites } = useFavorites();
  useBgm("/assets/audio/characters.mp3", 0.3);
  const { playHoverBlip } = useAudio();
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
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
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

  // 拉取人物列表用于前后切换导航
  // 收藏模式：仅使用收藏列表，按选定排序
  // 列表模式：按来源页传递的 sort 排序（默认星级）
  const favIdList = useMemo(() => [...favorites], [favorites]);

  useEffect(() => {
    let cancelled = false;
    const limit = fromFavorites ? 500 : NAV_LIST_LIMIT;
    const sort = navSort;
    getFigures({ page: 1, limit, sort })
      .then((res) => {
        if (cancelled) return;
        if (fromFavorites) {
          const favSet = new Set(favIdList);
          setNavList(res.items.filter((f) => favSet.has(f.id)));
        } else {
          setNavList(res.items);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fromFavorites, navSort, favIdList]);

  // 切换人物时关闭生平抽屉
  useEffect(() => { setQuestOpen(false); setQrOpen(false); setQrError(null); }, [id]);

  // 计算前后人物
  const navIndex = useMemo(() => {
    if (!id || navList.length === 0) return -1;
    return navList.findIndex((f) => f.id === id);
  }, [id, navList]);
  const prevFigure = navIndex > 0 ? navList[navIndex - 1] : null;
  const nextFigure = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;

  const navQuery = fromFavorites ? `?from=favorites&sort=${navSort}` : `?sort=${navSort}`;
  const goPrev = useCallback(() => {
    if (prevFigure) navigate(`/figures/${prevFigure.id}${navQuery}`);
  }, [prevFigure, navigate, navQuery]);
  const goNext = useCallback(() => {
    if (nextFigure) navigate(`/figures/${nextFigure.id}${navQuery}`);
  }, [nextFigure, navigate, navQuery]);

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

  // 从 URL 或数据库提取人物基本信息（用于 API 失败时降级展示）
  const fallbackInfo = useMemo(() => {
    if (!id) return null;
    return { id };
  }, [id]);

  if (loading && !figure) return <Loading />;

  // API 失败时的降级：如有本地资产则构造最小 figure 对象继续渲染
  const hasLocalAssets = localBundle && (
    localBundle.assets.classical?.files?.some((f) => f.url) ?? false
  );
  if (error && !figure) {
    if (hasLocalAssets) {
      // 构造最小 figure 供页面骨架渲染（showF degrade 标记）
      Object.assign(fallbackInfo!, { _degraded: true });
    } else {
      return (
        <div className="figure-detail-error" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ marginBottom: "0.5rem", opacity: 0.6 }}>加载失败</p>
          <p style={{ fontSize: "0.85rem", opacity: 0.4 }}>{error}</p>
          <Link to="/figures" style={{ marginTop: "1rem", display: "inline-block", opacity: 0.6 }}>
            ‹ 返回群英谱
          </Link>
        </div>
      );
    }
  }
  // 最终可用的 figure：API 返回 or 降级兜底
  const displayFigure = figure ?? (hasLocalAssets ? {
    id: id!,
    name: id!,
    aliases: [],
    birth_year: null,
    death_year: null,
    dynasty: "",
    identity: "",
    bio_summary: "",
    keyword_tags: [],
    avatar_icon: "",
    avatar_url: null,
    avatar: null,
    gender: "unknown" as const,
    star: 0,
    src_book: "",
    src_juan: null,
    src_chapter: null,
    passages: [],
  } as FigureDetail : null);
  if (!displayFigure) return null;

  const lifePct =
    displayFigure.death_year != null && displayFigure.birth_year != null
      ? Math.min(100, Math.round(((displayFigure.death_year - displayFigure.birth_year) / LIFE_MAX) * 100))
      : null;
  const lived = lifePct != null ? (displayFigure.death_year as number) - (displayFigure.birth_year as number) : null;
  const titlePlates = displayFigure.aliases?.filter((a) => a.length > 1).slice(0, 4) || [];
  const hasQuests = figure ? figure.passages.length > 0 : false;
  const highRarity = displayFigure.star >= 4;
  const hasFullScene = highRarity && !!(defaultAsset && (pickAssetFile(defaultAsset, "portrait-full") || pickAssetFile(defaultAsset, "portrait-bust")));
  const isDegraded = !!error && !figure; // 降级模式标记

  // 提取首行内容为变量，避免在 flex header 和正常流中重复编写
  const titlesEl = titlePlates.length > 0 ? (
    <div className="fg-titles">
      {titlePlates.map((a) => <span key={a} className="fg-title-plate">{a}</span>)}
    </div>
  ) : null;
  const badgesEl = (
    <div className="fg-badges">
      <span className="fg-badge is-identity">{displayFigure.identity}</span>
      <span className="fg-badge is-dynasty">{displayFigure.dynasty}</span>
    </div>
  );

  return (
    <div className="fg fg--stage" data-identity={displayFigure.identity}>
      {(() => {
        const sceneBg = highRarity && defaultAsset ? pickAssetFile(defaultAsset, "background") : null;
        return (
          <div
            className={`fg-stage${sceneBg ? " has-fullscene" : ""}`}
            style={sceneBg ? ({
              ["--scene-bg" as any]: `url(${sceneBg})`,
            } as React.CSSProperties) : undefined}
          >
            <Link to={fromFavorites ? "/library?tab=favorites" : "/figures"} className="fg-back">
              <span className="fg-back-arrow" aria-hidden="true">‹</span> {fromFavorites ? "我的收藏" : "返回群英谱"}
            </Link>
            {isDegraded && (
              <div style={{
                textAlign: "center", padding: "0.4rem 1rem", margin: "0.5rem auto 0",
                maxWidth: "360px", fontSize: "0.8rem", opacity: 0.55,
                background: "rgba(0,0,0,0.3)", borderRadius: "6px",
              }}>
                人物详情暂不可用，仅展示视觉素材
              </div>
            )}

            <motion.div
              className="fg-stage-art"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <Portrait figure={displayFigure} asset={defaultAsset} />
              {/* 全屏立绘模式：姓名+星级放在立绘左下 */}
              {hasFullScene && (
                <div className="fg-stage-caption on-fullscene">
                  <div className="fg-stage-eyebrow">青史人物 · {displayFigure.identity}</div>
                  <h1 className="fg-stage-name">{displayFigure.name}</h1>
                  {displayFigure.star >= 1 && (
                    <div className="fg-stage-star" data-star={displayFigure.star}>
                      <span className="fg-star-marks" aria-hidden="true">
                        {"★".repeat(displayFigure.star)}
                        <span className="fg-star-empty">{"★".repeat(5 - displayFigure.star)}</span>
                      </span>
                      <span className="fg-star-label">{STAR_LABEL[displayFigure.star]}</span>
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
          <div className="fg-panel-head">
            {!hasFullScene && <div className="fg-eyebrow">青史人物 · {displayFigure.identity}</div>}
            {hasFullScene && titlesEl}
            {hasFullScene && !titlePlates.length && badgesEl}
            <FigureFavButton figureId={displayFigure.id} figureName={displayFigure.name} />
          </div>

          {!hasFullScene && <h1 className="fg-name">{displayFigure.name}</h1>}
          {!hasFullScene && displayFigure.star >= 1 && (
            <div className="fg-star" data-star={displayFigure.star} title={`综合等级 ${displayFigure.star} 星`}>
              <span className="fg-star-marks" aria-hidden="true">
                {"★".repeat(displayFigure.star)}
                <span className="fg-star-empty">{"★".repeat(5 - displayFigure.star)}</span>
              </span>
              <span className="fg-star-label">{STAR_LABEL[displayFigure.star]}</span>
            </div>
          )}

          {!hasFullScene && titlesEl}
          {(!hasFullScene || titlePlates.length > 0) && badgesEl}

          {displayFigure.bio_summary && <p className="fg-bio-dark">{displayFigure.bio_summary}</p>}

          {displayFigure.keyword_tags?.length > 0 && (
            <div className="fg-tags-dark">
              {displayFigure.keyword_tags.slice(0, 6).map((t) => (
                <span key={t} className="fg-tag-dark">{t}</span>
              ))}
            </div>
          )}

          {lifePct != null && (
            <div className="fg-life">
              <div className="fg-life-label">
                <span>命途 · {yearShort(displayFigure.birth_year)} — {yearShort(displayFigure.death_year)}</span>
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
            {displayFigure.star >= 5 && (
              <button
                className={`fg-act is-wechat${qrLoading ? " is-loading" : ""}`}
                disabled={qrLoading}
                onClick={async () => {
                  setQrError(null);
                  setQrOpen(true);
                  setQrUrl(null);
                  setQrLoading(true);
                  try {
                    const res = await fetch(`/api/figures/${displayFigure.id}/qrcode`);
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      throw new Error(body?.error?.message || `HTTP ${res.status}`);
                    }
                    const data = await res.json();
                    if (data.url) {
                      setQrUrl(data.url);
                    } else {
                      throw new Error("二维码地址为空");
                    }
                  } catch (e: unknown) {
                    setQrOpen(false);
                    setQrError((e as Error).message || "生成失败");
                    setTimeout(() => setQrError(null), 4000);
                  } finally {
                    setQrLoading(false);
                  }
                }}
                onMouseEnter={playHoverBlip}
              >
                <span className="fg-act-icon" aria-hidden="true">{qrLoading ? "…" : "微"}</span>
                {qrLoading ? "生成中" : "添加微信"}
              </button>
            )}
            <button
              className="fg-act is-primary"
              onClick={() => setQuestOpen(true)}
              onMouseEnter={playHoverBlip}
              disabled={!hasQuests}
              title={hasQuests ? undefined : "此人物由机器抽取，史料待补录"}
            >
              <span className="fg-act-icon" aria-hidden="true">史</span>
              生平历程
              {hasQuests && <span className="fg-act-count">{displayFigure.passages.length}</span>}
            </button>
            <Link
              className={`fg-act is-ghost${relations.length === 0 ? " is-empty" : ""}`}
              to={relations.length > 0
                ? `/figures?view=graph&focus=${displayFigure.id}&depth=2`
                : `/figures?view=graph&focus=${displayFigure.id}`}
            >
              <span className="fg-act-icon" aria-hidden="true">联</span>
              人物关系
              <span className="fg-act-count">{relations.length}</span>
            </Link>
          </div>
          <p className="fg-rel-note">人物关系数据均出自二十四史正传记载</p>
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
              onMouseEnter={playHoverBlip}
              disabled={!nextFigure}
              aria-label={nextFigure ? `下一位：${nextFigure.name}` : "已是最后一位"}
              title={nextFigure ? nextFigure.name : "已是最后一位"}
            >
              <span className="fg-nav-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        );
      })()}

      <QuestDrawer open={questOpen} onClose={() => setQuestOpen(false)} figure={displayFigure} />
      {displayFigure.star >= 5 && (
        <WechatQrcodeModal open={qrOpen} onClose={() => setQrOpen(false)} figure={displayFigure} qrcodeUrl={qrUrl} />
      )}
      {qrError && (
        <div className="fg-qr-toast">
          <span className="fg-qr-toast-icon">!</span>
          <span>{qrError}</span>
        </div>
      )}
    </div>
  );
}
