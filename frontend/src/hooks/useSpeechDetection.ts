import { useState } from "react";
import { detectSpeech } from "../api/vadApi";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";
import { useVadSettings } from "./useVadSettings";

type SpeechDetectionState = {
  isDetecting: boolean;
  // 実行する。確定済みの区間まで消える設定(replaceAll)のときは、すぐには実行せず確認を求める
  requestDetection: () => void;
  isConfirmingReplaceAll: boolean;
  confirmReplaceAll: () => void;
  cancelReplaceAll: () => void;
};

// 自動検出(VAD)の実行。結果は候補としてuseSegmentsへ反映し、エラーはonErrorで知らせる
export function useSpeechDetection(onError: (message: string) => void): SpeechDetectionState {
  const { uploadId, channel } = useAudioSession();
  const { segments, applyDetectedSegments } = useSegments();
  const { vadSettings } = useVadSettings();
  const [isDetecting, setIsDetecting] = useState(false);
  const [isConfirmingReplaceAll, setIsConfirmingReplaceAll] = useState(false);

  const runDetection = async () => {
    if (!uploadId) return;
    setIsDetecting(true);
    try {
      const ranges = await detectSpeech(uploadId, channel, vadSettings);
      if (ranges.length === 0) {
        onError("発話区間が見つかりませんでした。設定の「しきい値」を下げると検出されやすくなります。");
        return;
      }
      const result = applyDetectedSegments(
        ranges,
        vadSettings.existingSegmentsMode,
        vadSettings.addDetectedAsConfirmed ? "manual" : "auto",
      );
      if (!result.success) onError(result.error);
    } catch {
      onError("自動検出に失敗しました。音声を読み込み直してから、もう一度お試しください。");
    } finally {
      setIsDetecting(false);
    }
  };

  const requestDetection = () => {
    const hasManualSegments = segments.some((s) => s.source === "manual");
    if (vadSettings.existingSegmentsMode === "replaceAll" && hasManualSegments) {
      setIsConfirmingReplaceAll(true);
      return;
    }
    runDetection();
  };

  return {
    isDetecting,
    requestDetection,
    isConfirmingReplaceAll,
    confirmReplaceAll: () => {
      setIsConfirmingReplaceAll(false);
      runDetection();
    },
    cancelReplaceAll: () => setIsConfirmingReplaceAll(false),
  };
}
