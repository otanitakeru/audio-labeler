import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAudioStreamUrl } from "../api/audioApi";
import AlertDialog from "../components/AlertDialog";
import AudioFileDetails from "../components/AudioFileDetails";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import ProgressButton from "../components/ProgressButton";
import TransportControls from "../components/TransportControls";
import Waveform from "../components/Waveform";
import { useAudioSession } from "../hooks/useAudioSession";
import { useDisplaySettings } from "../hooks/useDisplaySettings";
import { useEditingSettings } from "../hooks/useEditingSettings";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSegments } from "../hooks/useSegments";
import { useSpeechDetection } from "../hooks/useSpeechDetection";
import { useTranscription } from "../hooks/useTranscription";
import { useWavesurfer } from "../hooks/useWavesurfer";

function EditScreen() {
  const {
    audioInfo,
    uploadId,
    filename,
    channel,
    channelOutOfRange,
    isUploading,
    uploadingFilename,
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
  const [error, setError] = useState<string | null>(null);
  const { isDetecting, requestDetection, isConfirmingReplaceAll, confirmReplaceAll, cancelReplaceAll } =
    useSpeechDetection(setError);
  const {
    progress: transcriptionProgress,
    requestTranscription,
    isConfirmingOverwrite,
    confirmOverwrite,
    cancelOverwrite,
    requestStop,
    isConfirmingStop,
    confirmStop,
    dismissStop,
    error: transcriptionError,
    clearError: clearTranscriptionError,
  } = useTranscription();
  // 文字起こし中は結果を区間に入れていくため、編集・再生を止める。表示位置の移動(スクロール・拡大縮小)だけはできる(PLAN.md 5章)
  const isTranscribing = transcriptionProgress !== null;

  useEffect(() => {
    if (!uploadId) navigate("/", { replace: true });
  }, [uploadId, navigate]);

  // 範囲外のチャンネルはバックエンドで読み込めないため、設定で直されるまで波形を読み込まない。
  // 新しい音声のアップロード中も、別のファイルの波形が残っていると紛らわしいため、前の波形を破棄して何もない状態にする
  // (破棄すると再生も止まる)
  const audioUrl = uploadId && !channelOutOfRange && !isUploading ? getAudioStreamUrl(uploadId, channel) : null;
  const {
    isReady,
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
    segmentNudgeStepMs: editingSettings.segmentNudgeStepMs,
    amplitudeAxisRef,
    editingLocked: isTranscribing,
    highlightedSegmentId: transcriptionProgress?.currentSegmentId ?? null,
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
    isTranscribing,
  );

  if (!uploadId) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-gray-900">
        <span>{uploadingFilename ?? filename}</span>
        {!isUploading && audioInfo && <AudioFileDetails info={audioInfo} channel={channel} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* 読み込み中も表示しておき(操作のみ無効化)、読み込み完了時に波形の位置がずれないようにする */}
        <TransportControls
          disabled={!isReady || isUploading || isTranscribing}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={togglePlay}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={requestDetection}
            disabled={!isReady || isUploading || isDetecting || isTranscribing}
          >
            {isDetecting ? "検出中..." : "自動検出"}
          </Button>
          {transcriptionProgress ? (
            <ProgressButton
              label={transcriptionProgress.phase === "loadingModel" ? "モデル読み込み中" : "処理中"}
              hoverLabel="中止"
              ratio={
                transcriptionProgress.phase === "loadingModel"
                  ? null
                  : transcriptionProgress.done / transcriptionProgress.total
              }
              onClick={requestStop}
            />
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                // 文字起こし中は再生ボタン・ショートカットを止めていて再生を止められないため、先に止めておく
                if (isPlaying) togglePlay();
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
          peakAmplitude={visiblePeakAmplitude}
          mainWaveformHeight={mainWaveformHeight}
          minimapHeight={minimapHeight}
        />
        {/* ヘッダーから新しい音声を選んだ直後(アップロード中)も、読み込み中であることをすぐ示す */}
        {(!isReady || isUploading) && (
          <div
            // wavesurferの内部要素(カーソル・区間など)はz-indexを持つため、それより前面に出す
            className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-white/80 text-gray-500"
          >
            {!isUploading && channelOutOfRange ? (
              `ch ${channel} がありません。設定でチャンネルを変更してください`
            ) : (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                {isUploading ? "音声を読み込み中..." : "波形を読み込み中..."}
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog message={error} onClose={() => setError(null)} />
      <AlertDialog message={transcriptionError} onClose={clearTranscriptionError} />
      {/* ヘッダーから読み込んだ音声のエラー。ホーム画面では入力欄の下に出しているが、編集画面には表示する場所がないためダイアログで出す */}
      <AlertDialog message={uploadError} onClose={clearUploadError} />
      <ConfirmDialog
        open={isConfirmingReplaceAll}
        title="自動検出"
        message="確定済みのラベルも消して、検出結果で置き換えますか?"
        confirmLabel="置き換える"
        onConfirm={confirmReplaceAll}
        onCancel={cancelReplaceAll}
      />
      <ConfirmDialog
        open={isConfirmingOverwrite}
        title="文字起こし"
        message="確定済みのラベルも、文字起こしの結果で書き直しますか?"
        confirmLabel="書き直す"
        onConfirm={confirmOverwrite}
        onCancel={cancelOverwrite}
      />
      <ConfirmDialog
        open={isConfirmingStop}
        title="文字起こし"
        message="中止しますか?終わった区間のラベルは残ります。"
        confirmLabel="中止する"
        onConfirm={confirmStop}
        onCancel={dismissStop}
      />
    </div>
  );
}

export default EditScreen;
