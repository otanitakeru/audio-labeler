import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAudioStreamUrl } from "../api/audioApi";
import AlertDialog from "../components/AlertDialog";
import AudioFileDetails from "../components/AudioFileDetails";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import ProgressButton from "../components/ProgressButton";
import SpeechDetectionDialog from "../components/SpeechDetectionDialog";
import TransportControls from "../components/TransportControls";
import Waveform from "../components/Waveform";
import { useAudioSession } from "../hooks/useAudioSession";
import { useDisplaySettings } from "../hooks/useDisplaySettings";
import { useEditingSettings } from "../hooks/useEditingSettings";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePlaybackSettings } from "../hooks/usePlaybackSettings";
import { useSegments } from "../hooks/useSegments";
import { useSpeechDetection } from "../hooks/useSpeechDetection";
import { useTranscription } from "../hooks/useTranscription";
import { useViewOptions } from "../hooks/useViewOptions";
import { useWavesurfer } from "../hooks/useWavesurfer";
import type { Segment } from "../types";

// 自動検出・文字起こし中でないときに渡す空の途中経過。描き直しのeffectが毎回走らないよう、同じものを使い回す
const NO_RANGES: Pick<Segment, "startSec" | "endSec">[] = [];
const NO_SEGMENT_IDS: ReadonlySet<string> = new Set();

function EditScreen() {
  const {
    audioInfo,
    uploadId,
    filename,
    channel,
    isUploading,
    error: uploadError,
    clearError: clearUploadError,
  } = useAudioSession();
  const navigate = useNavigate();
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const amplitudeAxisRef = useRef<HTMLDivElement>(null);
  const {
    segments,
    validateNewSegment,
    addSegment,
    updateSegmentLabel,
    updateSegmentRange,
    removeSegment,
    mergeWithAdjacentSegment,
    undo,
    redo,
  } = useSegments();
  const { mainWaveformHeight, minimapHeight, playbackScrollMode } = useDisplaySettings();
  const { editingSettings } = useEditingSettings();
  const { viewOptions } = useViewOptions();
  const { playbackSettings, setPlaybackRate, setVolume } = usePlaybackSettings();
  const [error, setError] = useState<string | null>(null);
  const [isChoosingDetectionPreset, setIsChoosingDetectionPreset] = useState(false);
  const {
    progress: detectionProgress,
    requestDetection,
    isConfirmingReplaceAll,
    confirmReplaceAll,
    cancelReplaceAll,
    requestStop: requestDetectionStop,
    isConfirmingStop: isConfirmingDetectionStop,
    confirmStop: confirmDetectionStop,
    dismissStop: dismissDetectionStop,
    error: detectionError,
    clearError: clearDetectionError,
  } = useSpeechDetection();
  const {
    progress: transcriptionProgress,
    requestTranscription,
    isConfirmingOverwrite,
    confirmOverwrite,
    cancelOverwrite,
    requestStop: requestTranscriptionStop,
    isConfirmingStop: isConfirmingTranscriptionStop,
    confirmStop: confirmTranscriptionStop,
    dismissStop: dismissTranscriptionStop,
    error: transcriptionError,
    clearError: clearTranscriptionError,
  } = useTranscription();
  const isDetecting = detectionProgress !== null;
  const isTranscribing = transcriptionProgress !== null;
  // 自動検出・文字起こし中は結果を区間に入れるため、編集・再生を止める。表示位置の移動(スクロール・拡大縮小)だけはできる(PLAN.md 5章)
  const isEditingLocked = isDetecting || isTranscribing;

  useEffect(() => {
    if (!uploadId) navigate("/", { replace: true });
  }, [uploadId, navigate]);

  // 新しい音声のアップロード中は、読み込みのダイアログでキャンセルされたら今の音声のまま続けるため、波形は残しておく
  const audioUrl = uploadId ? getAudioStreamUrl(uploadId, channel) : null;
  const {
    isReady,
    isLoadFailed,
    isPlaying,
    currentTime,
    duration,
    visiblePeakAmplitude,
    togglePlay,
    deleteSelectedSegment,
    deselectSegment,
    selectAdjacentSegment,
    editSelectedSegmentLabel,
    mergeSelectedSegment,
    nudgeSelectedSegment,
    startLabelingSelection,
  } = useWavesurfer(waveformContainerRef, audioUrl, {
    segments,
    validateNewSegment,
    onAddSegment: (startSec, endSec, label) => {
      const result = addSegment(startSec, endSec, label);
      return result.success ? null : result.error;
    },
    onUpdateLabel: updateSegmentLabel,
    onUpdateRange: (id, startSec, endSec, historyGroupKey) => {
      const result = updateSegmentRange(id, startSec, endSec, historyGroupKey);
      return result.success ? null : result.error;
    },
    onDeleteSegment: removeSegment,
    onMergeSegment: mergeWithAdjacentSegment,
    onError: setError,
    mainWaveformHeight,
    minimapHeight,
    playbackScrollMode,
    playbackRate: playbackSettings.playbackRate,
    volume: playbackSettings.volume,
    segmentNudgeStepMs: editingSettings.segmentNudgeStepMs,
    amplitudeAxisRef,
    editingLocked: isEditingLocked,
    highlightedSegmentId: transcriptionProgress?.currentSegmentId ?? null,
    processedSegmentIds: transcriptionProgress?.processedSegmentIds ?? NO_SEGMENT_IDS,
    detectionPreviewRanges: detectionProgress?.speechRanges ?? NO_RANGES,
    highlightUnlabeledSegments: viewOptions.highlightUnlabeledSegments,
  });

  useKeyboardShortcuts(
    {
      togglePlay,
      labelSelection: startLabelingSelection,
      deleteSelectedSegment,
      deselectSegment,
      selectPreviousSegment: () => selectAdjacentSegment("previous"),
      selectNextSegment: () => selectAdjacentSegment("next"),
      editSegmentLabel: editSelectedSegmentLabel,
      undo,
      redo,
      mergeWithPreviousSegment: () => mergeSelectedSegment("previous"),
      mergeWithNextSegment: () => mergeSelectedSegment("next"),
      nudgeSegmentStartLeft: (e) => nudgeSelectedSegment("start", "left", e.repeat),
      nudgeSegmentStartRight: (e) => nudgeSelectedSegment("start", "right", e.repeat),
      nudgeSegmentEndLeft: (e) => nudgeSelectedSegment("end", "left", e.repeat),
      nudgeSegmentEndRight: (e) => nudgeSelectedSegment("end", "right", e.repeat),
    },
    isEditingLocked,
  );

  // 実行中は再生ボタン・ショートカットを止めていて再生を止められないため、始める前に止めておく
  const stopPlayback = () => {
    if (isPlaying) togglePlay();
  };

  if (!uploadId) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-gray-900">
        <span>{filename}</span>
        {audioInfo && <AudioFileDetails info={audioInfo} channel={channel} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* 読み込み中も表示しておき(操作のみ無効化)、読み込み完了時に波形の位置がずれないようにする */}
        <TransportControls
          disabled={!isReady || isUploading || isEditingLocked}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={togglePlay}
          playbackRate={playbackSettings.playbackRate}
          onPlaybackRateChange={setPlaybackRate}
          volume={playbackSettings.volume}
          onVolumeChange={setVolume}
        />
        <div className="flex items-center gap-3">
          {detectionProgress ? (
            <ProgressButton
              label={detectionProgress.phase === "preparing" ? "前処理中" : "処理中"}
              hoverLabel="中止"
              ratio={detectionProgress.phase === "preparing" ? null : detectionProgress.percent / 100}
              onClick={requestDetectionStop}
            />
          ) : (
            <Button
              variant="secondary"
              onClick={() => setIsChoosingDetectionPreset(true)}
              disabled={!isReady || isUploading || isTranscribing}
            >
              自動検出
            </Button>
          )}
          {transcriptionProgress ? (
            <ProgressButton
              label={transcriptionProgress.phase === "loadingModel" ? "モデル読み込み中" : "処理中"}
              hoverLabel="中止"
              ratio={
                transcriptionProgress.phase === "loadingModel"
                  ? null
                  : transcriptionProgress.done / transcriptionProgress.total
              }
              onClick={requestTranscriptionStop}
            />
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                stopPlayback();
                requestTranscription();
              }}
              disabled={!isReady || isUploading || isDetecting}
            >
              文字起こし
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Waveform
          containerRef={waveformContainerRef}
          amplitudeAxisRef={amplitudeAxisRef}
          isProcessing={isEditingLocked}
          peakAmplitude={visiblePeakAmplitude}
          mainWaveformHeight={mainWaveformHeight}
          minimapHeight={minimapHeight}
        />
        {!isReady && (
          <div
            // wavesurferの内部要素(カーソル・区間など)はz-indexを持つため、それより前面に出す
            className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-white/80 text-gray-500"
          >
            {isLoadFailed ? (
              "波形を読み込めませんでした。音声を読み込み直してください。"
            ) : (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                波形を読み込み中...
              </>
            )}
          </div>
        )}
      </div>

      <SpeechDetectionDialog
        open={isChoosingDetectionPreset}
        onRun={(presetId) => {
          setIsChoosingDetectionPreset(false);
          stopPlayback();
          requestDetection(presetId);
        }}
        onCancel={() => setIsChoosingDetectionPreset(false)}
      />
      <AlertDialog message={error} onClose={() => setError(null)} />
      <AlertDialog message={detectionError} onClose={clearDetectionError} />
      <AlertDialog message={transcriptionError} onClose={clearTranscriptionError} />
      {/* ヘッダーから読み込んだ音声のエラー。ホーム画面では入力欄の下に出しているが、編集画面には表示する場所がないためダイアログで出す */}
      <AlertDialog message={uploadError} onClose={clearUploadError} />
      <ConfirmDialog
        open={isConfirmingReplaceAll}
        title="自動検出"
        message="今の区間をすべて消して、検出結果で置き換えますか?"
        confirmLabel="置き換える"
        onConfirm={confirmReplaceAll}
        onCancel={cancelReplaceAll}
      />
      <ConfirmDialog
        open={isConfirmingDetectionStop}
        title="自動検出"
        message="中止しますか?"
        confirmLabel="中止する"
        onConfirm={confirmDetectionStop}
        onCancel={dismissDetectionStop}
      />
      <ConfirmDialog
        open={isConfirmingOverwrite}
        title="文字起こし"
        message="ラベルがある区間も、文字起こしの結果で書き直しますか?"
        confirmLabel="書き直す"
        onConfirm={confirmOverwrite}
        onCancel={cancelOverwrite}
      />
      <ConfirmDialog
        open={isConfirmingTranscriptionStop}
        title="文字起こし"
        message="中止しますか?終わった区間のラベルは残ります。"
        confirmLabel="中止する"
        onConfirm={confirmTranscriptionStop}
        onCancel={dismissTranscriptionStop}
      />
    </div>
  );
}

export default EditScreen;
