import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { VadSettings } from "../types";

// 検出パラメータは音声の性質に合わせて調整して使い続けるものなので、ショートカット割り当てと同様に
// リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.vadSettings";

// 検出パラメータの初期値は、研究室で使ってきたspeech-splitter-with-vad(config/test/vad.yaml)に合わせる。
// そこで指定していない項目はSilero VADの既定値
export const DEFAULT_VAD_SETTINGS: VadSettings = {
  existingSegmentsMode: "keepManual",
  addDetectedAsConfirmed: false,
  exportCandidates: true,
  samplingRate: 16000,
  threshold: 0.25,
  negThreshold: 0.25,
  minSpeechDurationMs: 200,
  maxSpeechDurationS: null,
  minSilenceDurationMs: 500,
  speechPadMs: 250,
  minSilenceAtMaxSpeechMs: 98,
  useMaxPossibleSilenceAtMaxSpeech: true,
  minSilenceAfterVadMs: 500,
};

// バックエンドでも同じ検証をしているが、設定ダイアログのOKの時点で気づけるようフロントでも検証する
export function findVadSettingsError(settings: VadSettings): string | null {
  if (settings.negThreshold !== null && settings.negThreshold > settings.threshold) {
    return "終了のしきい値は、しきい値以下にしてください";
  }
  return null;
}

function loadSettings(): VadSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする
    return raw ? { ...DEFAULT_VAD_SETTINGS, ...(JSON.parse(raw) as Partial<VadSettings>) } : DEFAULT_VAD_SETTINGS;
  } catch {
    return DEFAULT_VAD_SETTINGS;
  }
}

type VadSettingsState = {
  vadSettings: VadSettings;
  setVadSettings: (settings: VadSettings) => void;
};

const VadSettingsContext = createContext<VadSettingsState | null>(null);

export function VadSettingsProvider({ children }: { children: ReactNode }) {
  const [vadSettings, setVadSettings] = useState<VadSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vadSettings));
  }, [vadSettings]);

  return <VadSettingsContext.Provider value={{ vadSettings, setVadSettings }}>{children}</VadSettingsContext.Provider>;
}

export function useVadSettings(): VadSettingsState {
  const context = useContext(VadSettingsContext);
  if (!context) throw new Error("useVadSettings must be used within a VadSettingsProvider");
  return context;
}
