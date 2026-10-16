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
};

// スペクトログラムの色(設定ダイアログの「表示設定」で選ぶ)
export type SpectrogramColorMap = "gray" | "roseus" | "viridis";

// ヘッダーの「表示」メニューで切り替える、編集画面の表示のオン/オフ
export type ViewOptions = {
  // ラベルが空の区間を、ラベルがある区間と違う色にする(どこに未入力が残っているかを見つけやすくするため)
  highlightUnlabeledSegments: boolean;
  // メイン波形とラベル帯の間にスペクトログラムを出す(発話区間の境界や子音・無声区間を見分けるため)
  showSpectrogram: boolean;
};

// 再生ボタンの横で変える、再生の速さと音量
export type PlaybackSettings = {
  // 1が等速。音の高さは変えない
  playbackRate: number;
  // 1が元の音量。1より大きいと増幅する
  volume: number;
};

// 時間軸上で隣の区間を指す向き(前の区間との結合、次の区間の選択など)
export type SegmentDirection = "previous" | "next";

// 自動検出(VAD)を実行したとき、既にある区間をどう扱うか
// - replaceAll: すべて消し、検出結果だけにする
// - keepExisting: 既にある区間は残し、検出結果のうち重ならない区間だけを足す
export type ExistingSegmentsMode = "replaceAll" | "keepExisting";

// 自動検出(VAD)の検出パラメータ。バックエンドのVadParams(silero_vad.get_speech_timestampsの引数)と対応する
export type VadParams = {
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

// 検出パラメータの組に名前を付けたもの。実行するときに名前で選ぶ
export type VadPreset = {
  id: string;
  name: string;
  params: VadParams;
};

export type VadSettings = {
  // 検出の厳しさとは関係がないため、プリセットには含めずすべてのプリセットで共通にする
  existingSegmentsMode: ExistingSegmentsMode;
  // 最低1つはある
  presets: VadPreset[];
};

// 文字起こしの対象にする区間
// - unlabeled: ラベルが空の区間。ラベルがある区間は人が書いた(または確認した)文言なので上書きしない
// - all: すべての区間。ラベルがある区間も書き直す(モデルを変えてやり直すときなど)
export type TranscriptionTargetMode = "unlabeled" | "all";

// 文字起こし(Whisper)の設定
export type TranscriptionSettings = {
  targetMode: TranscriptionTargetMode;
  // Hugging Face のモデルID(例: openai/whisper-large-v3-turbo)
  modelId: string;
  // Whisperの言語コード(例: ja)。nullのときは区間ごとに自動判定する
  language: string | null;
};

// 音声を読み込んだ後に、続けてどこまで処理するか
// - none: 何もしない
// - speechDetection: 自動検出まで
// - transcription: 文字起こしまで(ラベルファイルを読み込まないときは、自動検出してから文字起こしする)
export type AfterLoadProcessing = "none" | "speechDetection" | "transcription";

// 読み込みのダイアログで選んだ内容のうち、次の読み込みの初期値として覚えておくもの
export type AudioLoadChoices = {
  channel: number;
  afterLoadProcessing: AfterLoadProcessing;
};

// 音声の切り出しで書き出すチャンネル
// - loaded: 読み込んだ(波形に表示している)チャンネル
// - all: すべてのチャンネル(多チャンネルのまま書き出す)
// - 数値: 指定した番号のチャンネル
export type SegmentExportChannel = "loaded" | "all" | number;

// 音声の切り出しで書き出すwavのサンプル形式(バックエンドのExportSampleFormatと対応)
export type SegmentExportSampleFormat = "pcm16" | "pcm24" | "float32";

// 音声の切り出しのダイアログで選んだ内容。次の切り出しの初期値として覚えておく
export type SegmentExportChoices = {
  // trueならラベルがある区間だけを書き出す
  labeledOnly: boolean;
  channel: SegmentExportChannel;
  // nullのときは元のまま
  sampleRate: number | null;
  // nullのときは元のまま
  sampleFormat: SegmentExportSampleFormat | null;
  // trueならtext.txt(idとラベルの対応)も入れる
  includeLabels: boolean;
  // segment.txt・text.txt の列の区切り
  delimiter: "tab" | "space";
  // trueならidを最大の番号の桁数にゼロ埋めする(100件なら001)
  zeroPadIds: boolean;
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
