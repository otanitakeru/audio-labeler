import type { Segment, VadSettings } from "../types";
import { API_BASE_URL } from "./audioApi";

type DetectedSpeechSegmentResponse = {
  start_sec: number;
  end_sec: number;
};

export async function detectSpeech(
  uploadId: string,
  channel: number,
  settings: VadSettings,
): Promise<Pick<Segment, "startSec" | "endSec">[]> {
  const res = await fetch(`${API_BASE_URL}/api/vad/uploads/${encodeURIComponent(uploadId)}`, {
    method: "POST",
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
  if (!res.ok) throw new Error("failed to detect speech");
  const data: DetectedSpeechSegmentResponse[] = await res.json();
  return data.map((d) => ({ startSec: d.start_sec, endSec: d.end_sec }));
}
