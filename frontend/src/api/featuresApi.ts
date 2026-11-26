import type { BackendFeatures } from "../types";
import { API_BASE_URL } from "./audioApi";

type BackendFeaturesResponse = {
  speech_detection: boolean;
  transcription: boolean;
};

// バックエンドで使える機能を問い合わせる。バックエンドがまだ起動していないときなどは失敗する
export async function fetchBackendFeatures(): Promise<BackendFeatures> {
  const res = await fetch(`${API_BASE_URL}/api/features`);
  if (!res.ok) throw new Error(`failed to fetch backend features: ${res.status}`);
  const body = (await res.json()) as BackendFeaturesResponse;
  return { speechDetection: body.speech_detection, transcription: body.transcription };
}
