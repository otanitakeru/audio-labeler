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

// onProgressには、ファイルを送り終えた割合(0〜1)を渡す。1になった後は、バックエンドが保存・確認を終えて返すのを待つ。
// fetchでは送った量が分からないため、XMLHttpRequestで送る。signalで中止すると、AbortErrorのDOMExceptionで失敗する
export async function uploadAudioFile(
  file: File,
  onProgress: (sentRatio: number) => void,
  signal: AbortSignal,
): Promise<AudioFileInfo> {
  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();
  const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    xhr.open("POST", `${API_BASE_URL}/api/audio/uploads`);
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => resolve({ status: xhr.status, body: xhr.response }));
    xhr.addEventListener("error", () => reject(new Error("failed to upload audio file")));
    xhr.addEventListener("abort", () => reject(new DOMException("upload aborted", "AbortError")));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(formData);
  });
  if (response.status === 400) {
    const { detail } = response.body as { detail: string };
    throw new AudioUploadRequestError(detail);
  }
  if (response.status < 200 || response.status >= 300) throw new Error("failed to upload audio file");
  const data = response.body as UploadedAudioInfoResponse;
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

// 使わなくなったアップロード済みの音声をバックエンドから消す
export async function deleteUploadedAudio(uploadId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/audio/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("failed to delete uploaded audio");
}

export function getAudioStreamUrl(uploadId: string, channel: number): string {
  return `${API_BASE_URL}/api/audio/uploads/${encodeURIComponent(uploadId)}?channel=${channel}`;
}
