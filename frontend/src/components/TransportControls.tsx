import { MAX_VOLUME, PLAYBACK_RATES } from "../hooks/usePlaybackSettings";

type TransportControlsProps = {
  disabled: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  playbackRate: number;
  onPlaybackRateChange: (playbackRate: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TransportControls({
  disabled,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  playbackRate,
  onPlaybackRateChange,
  volume,
  onVolumeChange,
}: TransportControlsProps) {
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
      {/* 速さ・音量は区間を変えないため、自動検出・文字起こしの実行中も変えられる(disabledにしない) */}
      <div className="flex h-10 items-center gap-1 text-sm text-gray-700">
        <div className="relative h-full">
          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
            aria-label="再生の速さ"
            className="h-full cursor-pointer appearance-none rounded-md bg-transparent pl-3 pr-7 outline-none tabular-nums hover:bg-gray-100"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <label className="flex h-full items-center gap-2 px-3">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-500" fill="currentColor" aria-hidden="true">
            <path d="M4 9.5v5a1 1 0 0 0 1 1h3l4.4 3.5a1 1 0 0 0 1.6-.8V5.8a1 1 0 0 0-1.6-.8L8 8.5H5a1 1 0 0 0-1 1z" />
            <path
              d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="range"
            min={0}
            max={MAX_VOLUME * 100}
            step={10}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            // 入力欄にフォーカスが残るとショートカットが効かず、← / → で区間を選ぶつもりが音量が変わってしまうため外す
            onPointerUp={(e) => e.currentTarget.blur()}
            aria-label="音量"
            className="w-40 cursor-pointer accent-gray-900"
          />
          <span className="w-10 text-right tabular-nums text-gray-500">{Math.round(volume * 100)}%</span>
        </label>
      </div>
    </div>
  );
}

export default TransportControls;
