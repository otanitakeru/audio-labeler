export type AudioFileInfo = {
  uploadId: string;
  filename: string;
  durationSec: number;
  sampleRate: number;
  channelCount: number;
  // 量子化ビット数。μ-lawなど、ビット数で表せない形式ではnull
  bitDepth: number | null;
  isFloat: boolean;
};

export type Segment = {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  // VADによる自動検出区間と手動区間を同じ型・同じバリデーションで扱うためのフィールド。
  // 文字起こし(Whisper)はラベルを埋めるだけで、sourceは変えない
  source: "manual" | "auto";
};

// 時間軸上で隣の区間を指す向き(前の区間との結合、次の区間の選択など)
export type SegmentDirection = "previous" | "next";

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

// 文字起こしの対象にする区間
// - unlabeledOrCandidates: ラベルが空の区間と候補(auto)。確定済みでラベルがある区間は人が書いた文言なので上書きしない
// - all: すべての区間。ラベルがある区間も書き直す(モデルを変えてやり直すときなど)
export type TranscriptionTargetMode = "unlabeledOrCandidates" | "all";

// 文字起こし(Whisper)の設定
export type TranscriptionSettings = {
  targetMode: TranscriptionTargetMode;
  // Hugging Face のモデルID(例: openai/whisper-large-v3-turbo)
  modelId: string;
  // Whisperの言語コード(例: ja)。nullのときは区間ごとに自動判定する
  language: string | null;
};

// 区間の編集操作に関する設定
export type EditingSettings = {
  // ショートカットで区間の開始・終了を1回ずらす量(ミリ秒)
  segmentNudgeStepMs: number;
};

// 再生中、カーソルが表示範囲を進んでいくときの表示位置の動かし方
// - center: カーソルが中央に来たら、中央に保ったまま波形を流す
// - page: カーソルが表示範囲の端に来たら、次の範囲へ切り替える
// - none: 表示位置を動かさない(カーソルは表示範囲の外へ出ていく)
export type PlaybackScrollMode = "center" | "page" | "none";
