import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import type { Figure } from "../../data/types";
import {
  pickAssetFile,
  sizedAssetUrl,
  getLocalFigureAssets,
} from "../../data/figure-assets";
import { FigureSymbol } from "./FigureSymbol";
import "./figure-game.css";

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export interface FigureCardProps {
  figure: Figure;
  /** 可选：外部传入头像 URL（覆盖静态/默认） */
  assetAvatarUrl?: string | null;
}

export function FigureCard({ figure, assetAvatarUrl }: FigureCardProps) {
  const navigate = useNavigate();
  const go = () => navigate(`/figures/${figure.id}`);

  // 本地静态兜底头像（仅内置若干人物，纯同步、无网络）；R2 资产由列表接口的 figure.avatar 直接给出，
  // 卡片不再逐个拉 /api/figures/:id/assets（消除 N+1）。
  const localStaticAvatar = useMemo(() => {
    const b = getLocalFigureAssets(figure.id);
    if (!b?.defaultStyle) return null;
    return pickAssetFile(b.assets[b.defaultStyle], "avatar");
  }, [figure.id]);

  // 头像优先级：外部传入 > 列表带来的 R2 资产(转 320px webp) > 本地静态兜底 > figure.avatar_url。
  // 都没有时不发请求（旧 /api/avatar 已废弃、会 404），露出底层 SVG 符号作静态兜底。
  const avatarSrc =
    assetAvatarUrl || sizedAssetUrl(figure.avatar, 320) || localStaticAvatar || figure.avatar_url || null;

  return (
    <motion.div
      className="fg-card"
      data-identity={figure.identity}
      data-gender={figure.gender || "unknown"}
      data-has-asset={avatarSrc ? "true" : "false"}
      variants={item}
      onClick={go}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && go()}
    >
      <div className="fg-card-art">
        <FigureSymbol icon={figure.avatar_icon} identity={figure.identity} />
        {avatarSrc && (
          <img
            src={avatarSrc}
            alt={figure.name}
            loading="lazy"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        {figure.star >= 1 && (
          <span
            className="fg-card-star"
            data-star={figure.star}
            title={`${figure.star} 星人物`}
            aria-label={`${figure.star} 星`}
          >
            {"★".repeat(figure.star)}
          </span>
        )}
        {figure.dynasty && <span className="fg-card-badge">{figure.dynasty}</span>}
        {figure.gender === "female" && <span className="fg-card-gender" title="女">♀</span>}
        {figure.gender === "male" && <span className="fg-card-gender male" title="男">♂</span>}
      </div>
      <div className="fg-card-body">
        <div className="fg-card-name-row">
          <span className="fg-card-name">{figure.name}</span>
          {figure.identity && <span className="fg-card-ident">{figure.identity}</span>}
        </div>
        {figure.bio_summary && <p className="fg-card-bio">{figure.bio_summary}</p>}
      </div>
    </motion.div>
  );
}
