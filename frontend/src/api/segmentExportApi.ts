import type { NamedRange } from "../formats/segmentExportFormat";
import type { SegmentExportSampleFormat } from "../types";
import { API_BASE_URL } from "./audioApi";

// チャンネル番号の誤りなど、利用者が直せるエラー。バックエンドが返す文言をそのまま見せる
export class SegmentExportRequestError extends Error {}

type SegmentExportRequest = {
  // ZIPの中に作るフォルダの名前
  folderName: string;
  // nullのときはすべてのチャンネル
  channel: number | null;
  // nullのときは元のまま
  sampleRate: number | null;
  sampleFormat: SegmentExportSampleFormat | null;
  ranges: NamedRange[];
  // wavと並べて入れるテキスト(ファイル名 → 中身)
  textFiles: Record<string, string>;
};

// 区間ごとに切り出したwavとテキストをまとめたZIPを受け取る
export async function exportSegmentAudio(uploadId: string, request: SegmentExportRequest): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/segment-export/uploads/${encodeURIComponent(uploadId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder_name: request.folderName,
      channel: request.channel,
      sample_rate: request.sampleRate,
      sample_format: request.sampleFormat,
      clips: request.ranges.map((r) => ({ name: r.name, start_sec: r.startSec, end_sec: r.endSec })),
      text_files: request.textFiles,
    }),
  });
  if (res.status === 400) {
    const { detail }: { detail: string } = await res.json();
    throw new SegmentExportRequestError(detail);
  }
  if (!res.ok) throw new Error("failed to export segments");
  return res.blob();
}
