import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { FigureDetail } from "../../data/types";

interface WechatQrcodeModalProps {
  open: boolean;
  onClose: () => void;
  figure: FigureDetail;
  qrcodeUrl: string | null;
}

export function WechatQrcodeModal({ open, onClose, figure, qrcodeUrl }: WechatQrcodeModalProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // URL 变化时重置图片状态
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [qrcodeUrl]);

  if (!mounted) return null;

  // 头像优先级：R2 资产头像 > 云存储 avatar_url > emoji 兜底
  const avatarSrc = figure.avatar || figure.avatar_url || null;

  const modalContent = (
    <AnimatePresence>
      {open && (
        <div className="fg-qr-root">
          <motion.div
            className="fg-qr-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            className="fg-qr-modal"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            role="dialog"
            aria-modal="true"
            aria-label={`微信扫码 · 与${figure.name}对话`}
          >
            <button className="fg-qr-close" onClick={onClose} aria-label="关闭">✕</button>

            <div className="fg-qr-head">
              <h3 className="fg-qr-title">微信扫码 · 对话{figure.name}</h3>
              <p className="fg-qr-sub">在「兰台圈」小程序与{figure.dynasty}{figure.identity || "人物"}即时对谈</p>
            </div>

            <div className="fg-qr-code-wrap">
              {!qrcodeUrl && (
                <div className="fg-qr-loading">
                  <div className="fg-qr-spinner" />
                  <span>正在问{figure.name}要微信号，稍等…</span>
                </div>
              )}
              {qrcodeUrl && !imgLoaded && !imgError && (
                <div className="fg-qr-loading">
                  <div className="fg-qr-spinner" />
                  <span>加载中…</span>
                </div>
              )}
              {qrcodeUrl && imgError && (
                <div className="fg-qr-loading">
                  <span style={{ color: "#c0392b", fontSize: "12px" }}>二维码加载失败</span>
                  <a
                    href={qrcodeUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#07C160", fontSize: "12px", textDecoration: "underline" }}
                  >
                    点击查看二维码
                  </a>
                </div>
              )}
              {qrcodeUrl && (
                <div className="fg-qr-img-box" style={{ display: imgLoaded ? "block" : "none" }}>
                  <img
                    className="fg-qr-img"
                    src={qrcodeUrl}
                    alt={`${figure.name} 小程序码`}
                    referrerPolicy="no-referrer"
                    onLoad={() => setImgLoaded(true)}
                    onError={() => setImgError(true)}
                  />
                  {avatarSrc && (
                    <img
                      className="fg-qr-avatar-overlay"
                      src={avatarSrc}
                      alt={figure.name}
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="fg-qr-foot">
              <span className="fg-qr-wechat-badge">微信扫一扫</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
