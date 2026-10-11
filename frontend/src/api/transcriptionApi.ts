import type { Segment, TranscriptionSettings } from "../types";
import { API_BASE_URL } from "./audioApi";

// バックエンドは進み具合を1行ずつ返す(NDJSON)。typeで見分ける
type TranscriptionStreamLine =
  { type: "ready" } | { type: "result"; index: number; text: string } | { type: "error"; error: string };

// モデルIDや言語コードの誤りなど、利用者が直せるエラー。バックエンドが返す文言をそのまま見せる
export class TranscriptionRequestError extends Error {}

type TranscriptionHandlers = {
  // モデルの読み込み(初回はダウンロードも)が終わり、区間の文字起こしを始めたとき
  onReady: () => void;
  // 1区間終わるごとに(rangesの何番目か, 文言)を受け取る
  onResult: (index: number, text: string) => void;
};

// 区間を順に文字起こしし、進み具合をhandlersで知らせる。すべて終わったら解決する
export async function transcribeRanges(
  uploadId: string,
  channel: number,
  ranges: Pick<Segment, "startSec" | "endSec">[],
  settings: TranscriptionSettings,
  { onReady, onResult }: TranscriptionHandlers,
  // 中止したときは接続を切る。バックエンドは処理中の区間を終えたところで止まる
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/transcription/uploads/${encodeURIComponent(uploadId)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      model_id: settings.modelId.trim(),
      language: settings.language?.trim() ?? null,
      ranges: ranges.map((r) => ({ start_sec: r.startSec, end_sec: r.endSec })),
    }),
  });
  if (res.status === 400) {
    const { detail }: { detail: string } = await res.json();
    throw new TranscriptionRequestError(detail);
  }
  if (!res.ok || !res.body) throw new Error("failed to transcribe");

  const handleLine = (line: string) => {
    if (line.trim() === "") return;
    const parsed: TranscriptionStreamLine = JSON.parse(line);
    if (parsed.type === "error") throw new TranscriptionRequestError(parsed.error);
    if (parsed.type === "ready") onReady();
    else onResult(parsed.index, parsed.text);
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
}
