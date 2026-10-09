import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAudioStreamUrl } from "../api/audioApi";
import AlertDialog from "../components/AlertDialog";
import TransportControls from "../components/TransportControls";
import Waveform from "../components/Waveform";
import { useAudioSession } from "../hooks/useAudioSession";
import { useDisplaySettings } from "../hooks/useDisplaySettings";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSegments } from "../hooks/useSegments";
import { useWavesurfer } from "../hooks/useWavesurfer";

function EditScreen() {
  const { uploadId, filename, channelCount, channel, channelOutOfRange } = useAudioSession();
  const navigate = useNavigate();
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const amplitudeAxisRef = useRef<HTMLDivElement>(null);
  const { segments, validateNewSegment, addSegment, updateSegmentLabel, updateSegmentRange, removeSegment } =
    useSegments();
  const { mainWaveformHeight, minimapHeight } = useDisplaySettings();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadId) navigate("/", { replace: true });
  }, [uploadId, navigate]);

  // 範囲外のチャンネルはバックエンドで読み込めないため、設定で直されるまで波形を読み込まない
  const audioUrl = uploadId && !channelOutOfRange ? getAudioStreamUrl(uploadId, channel) : null;
  const {
    isReady,
    isPlaying,
    currentTime,
    duration,
    visiblePeakAmplitude,
    togglePlay,
    deleteSelectedSegment,
    deselectSegment,
    startLabelingSelection,
  } = useWavesurfer(waveformContainerRef, audioUrl, {
    segments,
    validateNewSegment,
    onAddSegment: (startSec, endSec, label) => {
      const result = addSegment(startSec, endSec, label);
      return result.success ? null : result.error;
    },
    onUpdateLabel: updateSegmentLabel,
    onUpdateRange: (id, startSec, endSec) => {
      const result = updateSegmentRange(id, startSec, endSec);
      return result.success ? null : result.error;
    },
    onDeleteSegment: removeSegment,
    onError: setError,
    mainWaveformHeight,
    minimapHeight,
    amplitudeAxisRef,
  });

  useKeyboardShortcuts({
    togglePlay,
    labelSelection: startLabelingSelection,
    deleteSelectedSegment,
    deselectSegment,
  });

  if (!uploadId) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-gray-900">
        <span>{filename}</span>
        {channelCount > 1 && <span className="text-gray-500">ch {channel}</span>}
      </div>

      {/* 読み込み中も表示しておき(操作のみ無効化)、読み込み完了時に波形の位置がずれないようにする */}
      <TransportControls
        disabled={!isReady}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlay}
      />

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
            {channelOutOfRange ? (
              `ch ${channel} がありません。設定でチャンネルを変更してください`
            ) : (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                波形を読み込み中...
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog message={error} onClose={() => setError(null)} />
    </div>
  );
}

export default EditScreen;
