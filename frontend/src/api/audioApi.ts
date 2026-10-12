import type { AudioFileInfo } from "../types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// バックエンドのレスポンス(snake_case)。フロント内部ではAudioFileInfo(camelCase)に変換して扱う
type UploadedAudioInfoResponse = {
  upload_id: string;
  filename: string;
  duration_sec: number;
  sample_rate: number;
  channel_count: number;
  bit_depth: number | null;
  is_float: boolean;
};

// WAV以外・壊れたファイルなど、利用者が直せるエラー。バックエンドが返す文言をそのまま見せる
export class AudioUploadRequestError extends Error {}

export async function uploadAudioFile(file: File): Promise<AudioFileInfo> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/audio/uploads`, {
    method: "POST",
    body: formData,
  });
  if (res.status === 400) {
    const { detail }: { detail: string } = await res.json();
    throw new AudioUploadRequestError(detail);
  }
  if (!res.ok) throw new Error("failed to upload audio file");
  const data: UploadedAudioInfoResponse = await res.json();
  return {
    uploadId: data.upload_id,
    filename: data.filename,
    durationSec: data.duration_sec,
    sampleRate: data.sample_rate,
    channelCount: data.channel_count,
    bitDepth: data.bit_depth,
    isFloat: data.is_float,
  };
}

export function getAudioStreamUrl(uploadId: string, channel: number): string {
  return `${API_BASE_URL}/api/audio/uploads/${encodeURIComponent(uploadId)}?channel=${channel}`;
}
