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

// 置き換える前に確認を求めている内容
// - allSegments: 既にある区間をすべて消す設定(replaceAll)で、区間がある
// - targetSegment: 選んだ区間の中だけ検出し直すときに、その区間にラベルがある(置き換えるとラベルが消える)
export type SpeechDetectionReplacement = "allSegments" | "targetSegment";

type PendingDetection = { params: VadParams; targetSegment: Segment | null };

type SpeechDetectionState = {
  // 実行中でなければnull。実行中は区間を変える操作(編集画面・ヘッダーのラベル/音声の読み込み)をすべて止める
  progress: SpeechDetectionProgress | null;
  // 指定したプリセットで実行し、次の初期値として(音声全体と選んだ区間で別々に)覚える。
  // targetSegmentを渡すとその区間の中だけ検出し、結果で区間を置き換える。
  // 置き換えで区間やラベルが消えるときは、すぐには実行せず確認を求める
  requestDetection: (presetId: string, targetSegment: Segment | null) => void;
  // 確認を求めていなければnull
  confirmingReplacement: SpeechDetectionReplacement | null;
  confirmReplacement: () => void;
  cancelReplacement: () => void;
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
  const { segments, applyDetectedSegments, replaceSegmentWithDetected } = useSegments();
  const { vadSettings, setLastUsedPresetId } = useVadSettings();
  const [progress, setProgress] = useState<SpeechDetectionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 置き換えの確認中に、確認が済んだら実行する内容。確認中でなければnull
  const [pendingReplacement, setPendingReplacement] = useState<
    (PendingDetection & { replacement: SpeechDetectionReplacement }) | null
  >(null);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const runDetection = async ({ params, targetSegment }: PendingDetection) => {
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
        targetSegment,
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
      // 選んだ区間の中には他の区間がないため、「既にある区間」の設定は使わない
      const result = targetSegment
        ? replaceSegmentWithDetected(targetSegment.id, ranges)
        : applyDetectedSegments(ranges, vadSettings.existingSegmentsMode);
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

  const requestDetection = (presetId: string, targetSegment: Segment | null) => {
    const preset = findPresetOrFirst(vadSettings.presets, presetId);
    setLastUsedPresetId(targetSegment ? "selectedSegment" : "wholeAudio", preset.id);
    const detection = { params: preset.params, targetSegment };
    let replacement: SpeechDetectionReplacement | null = null;
    if (targetSegment) {
      if (targetSegment.label !== "") replacement = "targetSegment";
    } else if (vadSettings.existingSegmentsMode === "replaceAll" && segments.length > 0) {
      replacement = "allSegments";
    }
    if (replacement) {
      setPendingReplacement({ ...detection, replacement });
      return;
    }
    runDetection(detection);
  };

  return (
    <SpeechDetectionContext.Provider
      value={{
        progress,
        requestDetection,
        confirmingReplacement: pendingReplacement?.replacement ?? null,
        confirmReplacement: () => {
          setPendingReplacement(null);
          if (pendingReplacement) runDetection(pendingReplacement);
        },
        cancelReplacement: () => setPendingReplacement(null),
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
