export type AudioFileInfo = {
  uploadId: string;
  filename: string;
  durationSec: number;
  sampleRate: number;
  channelCount: number;
};

export type Segment = {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  // 将来のVAD/Whisperによる自動検出区間と手動区間を同じ型・同じバリデーションで扱うためのフィールド
  source: "manual" | "auto";
};

// 自動検出(VAD)を実行したとき、既にある区間をどう扱うか
// - keepManual: 確定済み(manual)の区間は残し、前回の候補(auto)だけを新しい結果で入れ替える。確定済みと重なる候補は追加しない
// - replaceAll: 確定済みも含めてすべて消し、検出結果だけにする
export type ExistingSegmentsMode = "keepManual" | "replaceAll";

export type VadSettings = {
  existingSegmentsMode: ExistingSegmentsMode;
  // 検出した区間を、候補(auto)ではなく最初から確定(manual)として追加するか
  addDetectedAsConfirmed: boolean;
  // ラベルの書き出しに、まだ確定していない候補(auto)も含めるか
  exportCandidates: boolean;
  // 以下はSilero VADの検出パラメータ(バックエンドのVadParams、silero_vad.get_speech_timestampsの引数と対応)
  samplingRate: 8000 | 16000;
  threshold: number;
  // nullのときはsilero_vadの既定(threshold - 0.15)
  negThreshold: number | null;
  minSpeechDurationMs: number;
  // nullのときは無制限
  maxSpeechDurationS: number | null;
  minSilenceDurationMs: number;
  speechPadMs: number;
  minSilenceAtMaxSpeechMs: number;
  useMaxPossibleSilenceAtMaxSpeech: boolean;
  // Silero VADの引数ではなく、このアプリ独自の後処理(バックエンドのmin_silence_duration_ms_after_vad)。
  // 前後の余白を足したあとの区間同士の間がこれより短ければつなげる。0なら結合しない
  minSilenceAfterVadMs: number;
};
