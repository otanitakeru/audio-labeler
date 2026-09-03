type TransportControlsProps = {
  isPlaying: boolean
  currentTime: number
  duration: number
  onTogglePlay: () => void
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TransportControls({ isPlaying, currentTime, duration, onTogglePlay }: TransportControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onTogglePlay}
        className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-900 hover:bg-gray-100"
      >
        {isPlaying ? '一時停止' : '再生'}
      </button>
      <span className="tabular-nums text-gray-500">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  )
}

export default TransportControls
