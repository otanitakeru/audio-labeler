import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { VadSettings } from "../types";

// 検出パラメータは音声の性質に合わせて調整して使い続けるものなので、ショートカット割り当てと同様に
// リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.vadSettings";

// 検出パラメータの初期値は、研究室で使ってきたspeech-splitter-with-vad(config/test/vad.yaml)に合わせる。
// そこで指定していない項目はSilero VADの既定値
// 既にある区間の扱いは、パラメータを変えて検出し直すときにそのまま使えるよう「すべて置き換える」を既定にする
// (「残す」だと、前回の検出結果と重なって何も足されないため)
export const DEFAULT_VAD_SETTINGS: VadSettings = {
  existingSegmentsMode: "replaceAll",
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
    if (!raw) return DEFAULT_VAD_SETTINGS;
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする
    const settings: VadSettings = { ...DEFAULT_VAD_SETTINGS, ...(JSON.parse(raw) as Partial<VadSettings>) };
    // 候補(区間の確定・未確定の区別)をなくす前に保存した設定には、今はない選択肢(keepManual)が残っているため初期値に戻す
    if (settings.existingSegmentsMode !== "replaceAll" && settings.existingSegmentsMode !== "keepExisting") {
      settings.existingSegmentsMode = DEFAULT_VAD_SETTINGS.existingSegmentsMode;
    }
    return settings;
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
