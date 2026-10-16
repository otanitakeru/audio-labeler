import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { detectSpeech } from "../api/vadApi";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";
import { findPresetOrFirst, useVadSettings } from "./useVadSettings";
import type { Segment, VadParams } from "../types";

type SpeechDetectionProgress = {
  // 前処理(モデルの読み込み・リサンプリング)中か、発話の判定中か。前処理の間は進み具合が分からない
  phase: "preparing" | "detecting";
  // 判定の進み具合(0〜100%)
  percent: number;
  // 判定済みの範囲で、発話らしさがしきい値を超えた部分。途中経過として波形に出す。
  // 区間の切り出し(最短の発話・余白など)を当てはめる前の値なので、終わったときに入る区間とはずれる
  speechRanges: Pick<Segment, "startSec" | "endSec">[];
};

type SpeechDetectionState = {
  // 実行中でなければnull。実行中は区間を変える操作(編集画面・ヘッダーのラベル/音声の読み込み)をすべて止める
  progress: SpeechDetectionProgress | null;
  // 指定したプリセットで実行し、次の初期値として覚える。既にある区間をすべて消す設定(replaceAll)で区間があるときは、
  // すぐには実行せず確認を求める
  requestDetection: (presetId: string) => void;
  isConfirmingReplaceAll: boolean;
  confirmReplaceAll: () => void;
  cancelReplaceAll: () => void;
  // 中止する。文字起こしと同じく、誤って押しても止まらないよう、すぐには止めず確認を求める
  requestStop: () => void;
  isConfirmingStop: boolean;
  confirmStop: () => void;
  dismissStop: () => void;
  error: string | null;
  clearError: () => void;
};

const SpeechDetectionContext = createContext<SpeechDetectionState | null>(null);

// 自動検出(VAD)の実行。結果は終わったときにまとめてuseSegmentsへ反映する。
// 実行中は編集画面だけでなくヘッダーの操作も止めるため、状態をContextで共有する
export function SpeechDetectionProvider({ children }: { children: ReactNode }) {
  const { uploadId, channel } = useAudioSession();
  const { segments, applyDetectedSegments } = useSegments();
  const { vadSettings, setLastUsedPresetId } = useVadSettings();
  const [progress, setProgress] = useState<SpeechDetectionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 置き換えの確認中に、確認が済んだら使うパラメータ。確認中でなければnull
  const [paramsPendingReplaceAll, setParamsPendingReplaceAll] = useState<VadParams | null>(null);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const runDetection = async (params: VadParams) => {
    if (!uploadId) return;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setProgress({ phase: "preparing", percent: 0, speechRanges: [] });
    try {
      // バックエンドは前処理が終わって判定を始めてから進み具合を返すため、最初に届いた時点で判定中に切り替わる
      const ranges = await detectSpeech(
        uploadId,
        channel,
        params,
        (percent, newSpeechRanges) =>
          setProgress((prev) => ({
            phase: "detecting",
            percent,
            speechRanges:
              newSpeechRanges.length === 0
                ? (prev?.speechRanges ?? [])
                : [...(prev?.speechRanges ?? []), ...newSpeechRanges],
          })),
        abortController.signal,
      );
      if (ranges.length === 0) {
        setError("発話区間が見つかりませんでした。プリセットの「しきい値」を下げると検出されやすくなります。");
        return;
      }
      const result = applyDetectedSegments(ranges, vadSettings.existingSegmentsMode);
      if (!result.success) setError(result.error);
    } catch {
      // 中止は利用者の操作なので、エラーとしては知らせない
      if (abortController.signal.aborted) return;
      setError("自動検出に失敗しました。音声を読み込み直してから、もう一度お試しください。");
    } finally {
      abortControllerRef.current = null;
      setProgress(null);
      // 中止の確認中に最後まで終わった・失敗したときは、止めるものがなくなるため確認を閉じる
      setIsConfirmingStop(false);
    }
  };

  const requestDetection = (presetId: string) => {
    const preset = findPresetOrFirst(vadSettings.presets, presetId);
    setLastUsedPresetId(preset.id);
    if (vadSettings.existingSegmentsMode === "replaceAll" && segments.length > 0) {
      setParamsPendingReplaceAll(preset.params);
      return;
    }
    runDetection(preset.params);
  };

  return (
    <SpeechDetectionContext.Provider
      value={{
        progress,
        requestDetection,
        isConfirmingReplaceAll: paramsPendingReplaceAll !== null,
        confirmReplaceAll: () => {
          setParamsPendingReplaceAll(null);
          if (paramsPendingReplaceAll) runDetection(paramsPendingReplaceAll);
        },
        cancelReplaceAll: () => setParamsPendingReplaceAll(null),
        requestStop: () => setIsConfirmingStop(true),
        isConfirmingStop,
        confirmStop: () => {
          setIsConfirmingStop(false);
          abortControllerRef.current?.abort();
        },
        dismissStop: () => setIsConfirmingStop(false),
        error,
        clearError: () => setError(null),
      }}
    >
      {children}
    </SpeechDetectionContext.Provider>
  );
}

export function useSpeechDetection(): SpeechDetectionState {
  const context = useContext(SpeechDetectionContext);
  if (!context) throw new Error("useSpeechDetection must be used within a SpeechDetectionProvider");
  return context;
}
