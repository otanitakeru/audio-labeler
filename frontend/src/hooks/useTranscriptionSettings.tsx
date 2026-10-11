import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { TranscriptionSettings } from "../types";

// モデルや言語は使い続けるものなので、自動検出の設定と同様にリロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.transcriptionSettings";

// 言語の自動判定は短い区間で外れやすいため、既定では日本語に固定する
export const DEFAULT_TRANSCRIPTION_SETTINGS: TranscriptionSettings = {
  targetMode: "unlabeled",
  modelId: "openai/whisper-large-v3-turbo",
  language: "ja",
};

export function findTranscriptionSettingsError(settings: TranscriptionSettings): string | null {
  if (settings.modelId.trim() === "") return "モデルIDを入力してください";
  if (settings.language !== null && settings.language.trim() === "") return "言語コードを入力してください";
  return null;
}

function loadSettings(): TranscriptionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRANSCRIPTION_SETTINGS;
    const settings: TranscriptionSettings = {
      ...DEFAULT_TRANSCRIPTION_SETTINGS,
      ...(JSON.parse(raw) as Partial<TranscriptionSettings>),
    };
    // 候補(区間の確定・未確定の区別)をなくす前に保存した設定には、今はない選択肢(unlabeledOrCandidates)が残っているため初期値に戻す
    if (settings.targetMode !== "unlabeled" && settings.targetMode !== "all") {
      settings.targetMode = DEFAULT_TRANSCRIPTION_SETTINGS.targetMode;
    }
    return settings;
  } catch {
    return DEFAULT_TRANSCRIPTION_SETTINGS;
  }
}

type TranscriptionSettingsState = {
  transcriptionSettings: TranscriptionSettings;
  setTranscriptionSettings: (settings: TranscriptionSettings) => void;
};

const TranscriptionSettingsContext = createContext<TranscriptionSettingsState | null>(null);

export function TranscriptionSettingsProvider({ children }: { children: ReactNode }) {
  const [transcriptionSettings, setTranscriptionSettings] = useState<TranscriptionSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transcriptionSettings));
  }, [transcriptionSettings]);

  return (
    <TranscriptionSettingsContext.Provider value={{ transcriptionSettings, setTranscriptionSettings }}>
      {children}
    </TranscriptionSettingsContext.Provider>
  );
}

export function useTranscriptionSettings(): TranscriptionSettingsState {
  const context = useContext(TranscriptionSettingsContext);
  if (!context) throw new Error("useTranscriptionSettings must be used within a TranscriptionSettingsProvider");
  return context;
}
