import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAudioStreamUrl } from "../api/audioApi";
import TransportControls from "../components/TransportControls";
import Waveform from "../components/Waveform";
import { useAudioSession } from "../hooks/useAudioSession";
import { useDisplaySettings } from "../hooks/useDisplaySettings";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSegments } from "../hooks/useSegments";
import { useWavesurfer } from "../hooks/useWavesurfer";

// 重なりなど、ユーザー操作に起因するエラーを表示し続ける時間(ms)
const ERROR_DISPLAY_MS = 4000;

function EditScreen() {
  const { uploadId, filename, channelCount, channel, channelOutOfRange } = useAudioSession();
  const navigate = useNavigate();
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const amplitudeAxisRef = useRef<HTMLDivElement>(null);
  const { segments, addSegment, updateSegmentLabel, updateSegmentRange, removeSegment } = useSegments();
  const { mainWaveformHeight, minimapHeight } = useDisplaySettings();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadId) navigate("/", { replace: true });
  }, [uploadId, navigate]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [error]);

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

      {error && (
        <p className="m-0 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

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
    </div>
  );
}

export default EditScreen;
