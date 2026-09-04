import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAudioStreamUrl } from '../api/audioApi'
import SegmentLabelForm from '../components/SegmentLabelForm'
import TransportControls from '../components/TransportControls'
import Waveform from '../components/Waveform'
import { useAudioSession } from '../hooks/useAudioSession'
import { useDisplaySettings } from '../hooks/useDisplaySettings'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSegments } from '../hooks/useSegments'
import { useWavesurfer } from '../hooks/useWavesurfer'

type PendingSelection = { startSec: number; endSec: number }

function EditScreen() {
  const { uploadId, filename, channelCount, channel } = useAudioSession()
  const navigate = useNavigate()
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const amplitudeAxisRef = useRef<HTMLDivElement>(null)
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
    visiblePeakAmplitude,
    togglePlay,
    clearPendingRegion,
  } = useWavesurfer(waveformContainerRef, audioUrl, {
    segments,
    onRegionCreated: (startSec, endSec) => setPendingSelection({ startSec, endSec }),
    mainWaveformHeight,
    minimapHeight,
    amplitudeAxisRef,
  })

  useKeyboardShortcuts({ togglePlay })

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

      <div className="relative">
        <Waveform
          containerRef={waveformContainerRef}
          amplitudeAxisRef={amplitudeAxisRef}
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
