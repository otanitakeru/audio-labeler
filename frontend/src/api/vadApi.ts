import type { Segment, VadSettings } from "../types";
import { API_BASE_URL } from "./audioApi";

type DetectedSpeechSegmentResponse = {
  start_sec: number;
  end_sec: number;
};

// バックエンドは進み具合を1行ずつ返し、最後に検出結果を返す(NDJSON)。typeで見分ける
type SpeechDetectionStreamLine =
  | { type: "progress"; percent: number; speech_ranges: DetectedSpeechSegmentResponse[] }
  | { type: "result"; segments: DetectedSpeechSegmentResponse[] };

type DetectedRange = Pick<Segment, "startSec" | "endSec">;

const toDetectedRange = (d: DetectedSpeechSegmentResponse): DetectedRange => ({
  startSec: d.start_sec,
  endSec: d.end_sec,
});

// 発話区間を検出し、終わったら検出した区間で解決する。途中経過は、進み具合(0〜100%)と、前回から後に見つかった
// 発話らしさがしきい値を超えた部分をonProgressで知らせる。後者は区間の切り出し(最短の発話・余白など)を
// 当てはめる前の値なので、最後に返す区間とはずれる。
// onProgressは前処理(モデルの読み込み・リサンプリング)が終わり、判定を始めてから呼ばれる
export async function detectSpeech(
  uploadId: string,
  channel: number,
  settings: VadSettings,
  onProgress: (percent: number, newSpeechRanges: DetectedRange[]) => void,
  // 中止したときは接続を切る。バックエンドは検出を途中でやめる
  signal: AbortSignal,
): Promise<DetectedRange[]> {
  const res = await fetch(`${API_BASE_URL}/api/vad/uploads/${encodeURIComponent(uploadId)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      params: {
        sampling_rate: settings.samplingRate,
        threshold: settings.threshold,
        neg_threshold: settings.negThreshold,
        min_speech_duration_ms: settings.minSpeechDurationMs,
        max_speech_duration_s: settings.maxSpeechDurationS,
        min_silence_duration_ms: settings.minSilenceDurationMs,
        speech_pad_ms: settings.speechPadMs,
        min_silence_at_max_speech: settings.minSilenceAtMaxSpeechMs,
        use_max_poss_sil_at_max_speech: settings.useMaxPossibleSilenceAtMaxSpeech,
        min_silence_duration_ms_after_vad: settings.minSilenceAfterVadMs,
      },
    }),
  });
  if (!res.ok || !res.body) throw new Error("failed to detect speech");

  let detected: DetectedSpeechSegmentResponse[] | null = null;
  const handleLine = (line: string) => {
    if (line.trim() === "") return;
    const parsed: SpeechDetectionStreamLine = JSON.parse(line);
    if (parsed.type === "progress") onProgress(parsed.percent, parsed.speech_ranges.map(toDetectedRange));
    else detected = parsed.segments;
  };

  // 1回に届く塊は行の途中で切れていることがあるため、改行までたまった分だけを処理する
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  handleLine(buffered);

  // バックエンドが途中で失敗すると、結果の行を返さずに接続が閉じる
  if (detected === null) throw new Error("failed to detect speech");
  return (detected as DetectedSpeechSegmentResponse[]).map(toDetectedRange);
}
