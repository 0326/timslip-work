import { useEffect, useState } from "react";
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

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // URL 变化时重置图片状态
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [qrcodeUrl]);

  return (
    <AnimatePresence>
      {open && (
        <>
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
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            role="dialog"
            aria-label={`微信扫码 · 与${figure.name}对话`}
          >
            <button className="fg-qr-close" onClick={onClose} aria-label="关闭">✕</button>

            <div className="fg-qr-head">
              <h3 className="fg-qr-title">微信扫码 · 对话{figure.name}</h3>
              <p className="fg-qr-sub">在「兰台圈」小程序与{figure.dynasty}{figure.identity || "人物"}即时对谈</p>
            </div>

            <div className="fg-qr-code-wrap">
              {/* 没有 URL 时：请求中 */}
              {!qrcodeUrl && (
                <div className="fg-qr-loading">
                  <div className="fg-qr-spinner" />
                  <span>正在生成小程序码…</span>
                </div>
              )}
              {/* 有 URL 但图片加载中 */}
              {qrcodeUrl && !imgLoaded && !imgError && (
                <div className="fg-qr-loading">
                  <div className="fg-qr-spinner" />
                  <span>加载中…</span>
                </div>
              )}
              {/* 图片加载失败 */}
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
              {/* 图片（始终渲染，通过 opacity 控制可见性） */}
              {qrcodeUrl && (
                <img
                  className="fg-qr-img"
                  src={qrcodeUrl}
                  alt={`${figure.name} 小程序码`}
                  referrerPolicy="no-referrer"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgError(true)}
                  style={{ display: imgLoaded ? "block" : "none" }}
                />
              )}
            </div>

            <div className="fg-qr-foot">
              <span className="fg-qr-wechat-badge">微信扫一扫</span>
              <span className="fg-qr-tip">扫码后进入小程序角色详情页，点击「开始聊天」即可对话</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
