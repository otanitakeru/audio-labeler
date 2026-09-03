import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAudioStreamUrl } from '../api/audioApi'
import RangeSlider from '../components/RangeSlider'
import SegmentLabelForm from '../components/SegmentLabelForm'
import TransportControls from '../components/TransportControls'
import Waveform from '../components/Waveform'
import { useAudioSession } from '../hooks/useAudioSession'
import { useDisplaySettings } from '../hooks/useDisplaySettings'
import { useSegments } from '../hooks/useSegments'
import { MAX_VERTICAL_ZOOM, MAX_ZOOM, MIN_VERTICAL_ZOOM, MIN_ZOOM, useWavesurfer } from '../hooks/useWavesurfer'

type PendingSelection = { startSec: number; endSec: number }

function EditScreen() {
  const { uploadId, filename, channelCount, channel } = useAudioSession()
  const navigate = useNavigate()
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const { segments, addSegment } = useSegments()
  const { mainWaveformHeight, minimapHeight } = useDisplaySettings()
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null)

  useEffect(() => {
    if (!uploadId) navigate('/', { replace: true })
  }, [uploadId, navigate])

  const audioUrl = uploadId ? getAudioStreamUrl(uploadId, channel) : null
  const {
    isReady,
    isPlaying,
    currentTime,
    duration,
    zoom,
    setZoom,
    verticalZoom,
    setVerticalZoom,
    visiblePeakAmplitude,
    togglePlay,
    clearPendingRegion,
  } = useWavesurfer(waveformContainerRef, audioUrl, {
    segments,
    onRegionCreated: (startSec, endSec) => setPendingSelection({ startSec, endSec }),
    mainWaveformHeight,
    minimapHeight,
  })

  if (!uploadId) return null

  const handleCancelSelection = () => {
    clearPendingRegion()
    setPendingSelection(null)
  }

  const handleSubmitLabel = (label: string): string | null => {
    if (!pendingSelection) return null
    const result = addSegment(pendingSelection.startSec, pendingSelection.endSec, label)
    if (!result.success) return result.error
    clearPendingRegion()
    setPendingSelection(null)
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-gray-900">
        <span>{filename}</span>
        {channelCount > 1 && <span className="text-gray-500">ch {channel}</span>}
      </div>

      {isReady && (
        <div className="flex flex-wrap justify-end gap-4">
          <RangeSlider label="縦拡大" min={MIN_VERTICAL_ZOOM} max={MAX_VERTICAL_ZOOM} step={0.1} value={verticalZoom} onChange={setVerticalZoom} />
          <RangeSlider label="拡大" min={MIN_ZOOM} max={MAX_ZOOM} value={zoom} onChange={setZoom} />
        </div>
      )}

      <div className="relative">
        <Waveform
          containerRef={waveformContainerRef}
          peakAmplitude={visiblePeakAmplitude}
          mainWaveformHeight={mainWaveformHeight}
          minimapHeight={minimapHeight}
        />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-white/80 text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            波形を読み込み中...
          </div>
        )}
      </div>

      {isReady && (
        <TransportControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={togglePlay}
        />
      )}

      {pendingSelection && (
        <SegmentLabelForm
          startSec={pendingSelection.startSec}
          endSec={pendingSelection.endSec}
          onSubmit={handleSubmitLabel}
          onCancel={handleCancelSelection}
        />
      )}
    </div>
  )
}

export default EditScreen
