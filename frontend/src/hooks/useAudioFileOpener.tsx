import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";
import { useSpeechDetection } from "./useSpeechDetection";
import { useTranscription } from "./useTranscription";
import type { LabeledRange } from "../formats/labelFormat";
import type { AfterLoadProcessing, AudioFileInfo } from "../types";

// 読み込みのダイアログで決めた内容
export type AudioLoadOptions = {
  channel: number;
  // 選ばなかったときはnull
  labelRanges: LabeledRange[] | null;
  afterLoadProcessing: AfterLoadProcessing;
};

// 読み込んだ後に続けて行う処理の、次の段階
// - speechDetection: 自動検出を始める
// - waitingSpeechDetection: 自動検出が終わるのを待つ(終わったら、必要なら文字起こしへ進む)
// - transcription: ラベルが空の区間を文字起こしする
type AfterLoadTask = {
  // この音声に切り替わった後でだけ進める。切り替わる前のレンダーでは、自動検出・文字起こしが前の音声を対象にしてしまうため
  uploadId: string;
  step: "speechDetection" | "waitingSpeechDetection" | "transcription";
  transcribeAfterDetection: boolean;
};

function planAfterLoadTask(uploadId: string, options: AudioLoadOptions): AfterLoadTask | null {
  const { afterLoadProcessing, labelRanges } = options;
  if (afterLoadProcessing === "none") return null;
  // ラベルファイルを選んだときは自動検出しない(読み込んだラベルを消したり、重ねたりしないため。PLAN.md 4章-1)
  if (labelRanges !== null) {
    return afterLoadProcessing === "transcription"
      ? { uploadId, step: "transcription", transcribeAfterDetection: false }
      : null;
  }
  return {
    uploadId,
    step: "speechDetection",
    transcribeAfterDetection: afterLoadProcessing === "transcription",
  };
}

type AudioFileOpenerState = {
  openAudioFile: (file: File) => void;
  isConfirmingDiscard: boolean;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  // アップロードが済み、読み込みのダイアログで内容を決めてもらっている音声。ダイアログを出していなければnull
  pendingAudioInfo: AudioFileInfo | null;
  confirmLoad: (options: AudioLoadOptions) => void;
  cancelLoad: () => void;
};

const AudioFileOpenerContext = createContext<AudioFileOpenerState | null>(null);

// 新しい音声の読み込み。書き出していない変更の確認 → アップロード → 読み込みのダイアログ → 読み込み → 続けて行う処理、の順に進める。
// ホーム画面とヘッダーのどちらから始めても、読み込んだ後の処理は画面遷移をまたいで続くため、状態をContextで持つ
export function AudioFileOpenerProvider({ children }: { children: ReactNode }) {
  const { uploadId, uploadFile, loadAudio } = useAudioSession();
  const { segments, hasUnsavedChanges, resetSegments } = useSegments();
  const { progress: detectionProgress, requestDetection } = useSpeechDetection();
  const { requestTranscription } = useTranscription();
  // 破棄してよいか確認している間、選ばれたファイルをここに控えておく
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingAudioInfo, setPendingAudioInfo] = useState<AudioFileInfo | null>(null);
  const [afterLoadTask, setAfterLoadTask] = useState<AfterLoadTask | null>(null);

  const uploadAndAsk = async (file: File) => {
    const info = await uploadFile(file);
    if (info) setPendingAudioInfo(info);
  };

  const openAudioFile = (file: File) => {
    if (hasUnsavedChanges) {
      setPendingFile(file);
      return;
    }
    uploadAndAsk(file);
  };

  const confirmDiscard = () => {
    if (pendingFile) uploadAndAsk(pendingFile);
    setPendingFile(null);
  };

  // 音声の切り替えと区間の作り直しは、同じレンダーで反映されるよう続けて呼ぶ
  const confirmLoad = (options: AudioLoadOptions) => {
    if (!pendingAudioInfo) return;
    loadAudio(pendingAudioInfo, options.channel);
    resetSegments(options.labelRanges ?? []);
    setAfterLoadTask(planAfterLoadTask(pendingAudioInfo.uploadId, options));
    setPendingAudioInfo(null);
  };

  // 自動検出・文字起こしは、実行した時点の音声・区間を対象にする。読み込みの直後や自動検出の結果が入った直後は
  // まだ新しい状態でレンダーされていないため、状態が切り替わった後のレンダーでeffectから1段階ずつ進める
  useEffect(() => {
    if (!afterLoadTask || afterLoadTask.uploadId !== uploadId) return;
    if (afterLoadTask.step === "speechDetection") {
      // 読み込み直後で区間は空のため、「すべて置き換える」の確認は出ずにすぐ始まる
      requestDetection();
      setAfterLoadTask({ ...afterLoadTask, step: "waitingSpeechDetection" });
      return;
    }
    if (afterLoadTask.step === "waitingSpeechDetection") {
      if (detectionProgress !== null) return;
      // 中止・失敗・0件のときは区間が空のままなので、文字起こしには進まない
      const shouldTranscribe = afterLoadTask.transcribeAfterDetection && segments.length > 0;
      setAfterLoadTask(shouldTranscribe ? { ...afterLoadTask, step: "transcription" } : null);
      return;
    }
    // 選んだラベルにラベルが空の区間がなければ、することがないので何もしない(エラーにはしない)
    if (segments.some((s) => s.label === "")) requestTranscription("unlabeled");
    setAfterLoadTask(null);
  }, [afterLoadTask, uploadId, detectionProgress, segments, requestDetection, requestTranscription]);

  return (
    <AudioFileOpenerContext.Provider
      value={{
        openAudioFile,
        isConfirmingDiscard: pendingFile !== null,
        confirmDiscard,
        cancelDiscard: () => setPendingFile(null),
        pendingAudioInfo,
        confirmLoad,
        cancelLoad: () => setPendingAudioInfo(null),
      }}
    >
      {children}
    </AudioFileOpenerContext.Provider>
  );
}

export function useAudioFileOpener(): AudioFileOpenerState {
  const context = useContext(AudioFileOpenerContext);
  if (!context) throw new Error("useAudioFileOpener must be used within an AudioFileOpenerProvider");
  return context;
}
