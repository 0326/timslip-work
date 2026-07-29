/**
 * 极简静音开关 — 喇叭图标，点击切换静音/取消静音。
 * 固定在右上角，不跟随 CTA hover 淡出（用户可随时静音）。
 */
interface MuteToggleProps {
  muted: boolean;
  onToggle: () => void;
}

export function MuteToggle({ muted, onToggle }: MuteToggleProps) {
  return (
    <button
      className="portal-mute-toggle"
      onClick={onToggle}
      aria-label={muted ? "开启声音" : "静音"}
      title={muted ? "开启声音" : "静音"}
    >
      {muted ? (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.54 8.46a5 5 0 010 7.07" />
          <path d="M19.07 4.93a10 10 0 010 14.14" />
        </svg>
      )}
    </button>
  );
}
