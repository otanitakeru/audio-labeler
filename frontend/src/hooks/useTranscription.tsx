import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { TranscriptionRequestError, transcribeRanges } from "../api/transcriptionApi";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";
import { useTranscriptionSettings } from "./useTranscriptionSettings";
import type { Segment, TranscriptionTargetMode } from "../types";

// 区間を文字起こしの対象にするか。unlabeledOrCandidatesでは、確定済みでラベルがある区間は人が書いた文言なので上書きしない
function isTranscriptionTarget(segment: Segment, mode: TranscriptionTargetMode): boolean {
  return mode === "all" || segment.label === "" || segment.source === "auto";
}

type TranscriptionProgress = {
  // モデルの読み込み中(初回はダウンロードも含む)か、区間の文字起こし中か
  phase: "loadingModel" | "transcribing";
  done: number;
  total: number;
  // 今文字起こししている区間。バックエンドは区間を順に処理するため、まだ結果が届いていない最初の区間になる
  currentSegmentId: string | null;
};

type TranscriptionState = {
  // 実行中でなければnull。実行中は区間を変える操作(編集画面・ヘッダーのラベル/音声の読み込み)をすべて止める
  progress: TranscriptionProgress | null;
  // 実行する。確定済みのラベルまで書き直す設定(all)で、そうした区間があるときは、すぐには実行せず確認を求める
  requestTranscription: () => void;
  isConfirmingOverwrite: boolean;
  confirmOverwrite: () => void;
  cancelOverwrite: () => void;
  // 中止する。誤って押しても止まらないよう、すぐには止めず確認を求める。止めても、終わった区間までのラベルは残る
  requestStop: () => void;
  isConfirmingStop: boolean;
  confirmStop: () => void;
  dismissStop: () => void;
  error: string | null;
  clearError: () => void;
};

const TranscriptionContext = createContext<TranscriptionState | null>(null);

// 文字起こし(Whisper)の実行。1区間終わるごとに結果をuseSegmentsで区間のラベルへ反映する。
// 実行中は編集画面だけでなくヘッダーの操作も止めるため、状態をContextで共有する
export function TranscriptionProvider({ children }: { children: ReactNode }) {
  const { uploadId, channel } = useAudioSession();
  const { segments, applyTranscribedLabel } = useSegments();
  const { transcriptionSettings } = useTranscriptionSettings();
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingOverwrite, setIsConfirmingOverwrite] = useState(false);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 区間は追加順に並んでいるため、処理中の区間(緑)が波形の左から右へ進むよう開始時刻順に並べる
  const targets = segments
    .filter((s) => isTranscriptionTarget(s, transcriptionSettings.targetMode))
    .sort((a, b) => a.startSec - b.startSec);

  const runTranscription = async () => {
    if (!uploadId) return;
    // 実行中は他の編集を止めているため、1回の実行で入れたラベルは必ず元に戻す1回でまとめて戻せる
    const historyGroupKey = `transcription:${crypto.randomUUID()}`;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const total = targets.length;
    setProgress({ phase: "loadingModel", done: 0, total, currentSegmentId: null });
    try {
      await transcribeRanges(
        uploadId,
        channel,
        targets,
        transcriptionSettings,
        {
          onReady: () => setProgress({ phase: "transcribing", done: 0, total, currentSegmentId: targets[0].id }),
          onResult: (index, label) => {
            applyTranscribedLabel(targets[index].id, label, historyGroupKey);
            const done = index + 1;
            setProgress({ phase: "transcribing", done, total, currentSegmentId: targets[done]?.id ?? null });
          },
        },
        abortController.signal,
      );
    } catch (e) {
      // 中止は利用者の操作なので、エラーとしては知らせない
      if (abortController.signal.aborted) return;
      setError(
        e instanceof TranscriptionRequestError
          ? e.message
          : "文字起こしに失敗しました。音声を読み込み直してから、もう一度お試しください。",
      );
    } finally {
      abortControllerRef.current = null;
      setProgress(null);
      // 中止の確認中に最後まで終わった・失敗したときは、止めるものがなくなるため確認を閉じる
      setIsConfirmingStop(false);
    }
  };

  const requestTranscription = () => {
    if (targets.length === 0) {
      setError("文字起こしする区間がありません。先に自動検出するか、区間を作ってください。");
      return;
    }
    // 人が書いた(確定済みの)ラベルを上書きするときだけ、自動検出の「すべて置き換える」と同様に確認する
    if (targets.some((s) => s.source === "manual" && s.label !== "")) {
      setIsConfirmingOverwrite(true);
      return;
    }
    runTranscription();
  };

  return (
    <TranscriptionContext.Provider
      value={{
        progress,
        requestTranscription,
        isConfirmingOverwrite,
        confirmOverwrite: () => {
          setIsConfirmingOverwrite(false);
          runTranscription();
        },
        cancelOverwrite: () => setIsConfirmingOverwrite(false),
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
    </TranscriptionContext.Provider>
  );
}

export function useTranscription(): TranscriptionState {
  const context = useContext(TranscriptionContext);
  if (!context) throw new Error("useTranscription must be used within a TranscriptionProvider");
  return context;
}
