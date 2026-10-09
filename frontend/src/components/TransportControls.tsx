type TransportControlsProps = {
  disabled: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TransportControls({ disabled, isPlaying, currentTime, duration, onTogglePlay }: TransportControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={disabled}
        aria-label={isPlaying ? "一時停止" : "再生"}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          {isPlaying ? (
            <>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </>
          ) : (
            <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" />
          )}
        </svg>
      </button>
      <span className="tabular-nums text-gray-500">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

export default TransportControls;
