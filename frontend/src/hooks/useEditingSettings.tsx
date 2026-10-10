import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EditingSettings } from "../types";

// 編集操作の好みは作業のたびに使い続けるものなので、ショートカット割り当てと同様に
// リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.editingSettings";

export const MIN_SEGMENT_NUDGE_STEP_MS = 1;
export const MAX_SEGMENT_NUDGE_STEP_MS = 1000;

export const DEFAULT_EDITING_SETTINGS: EditingSettings = {
  segmentNudgeStepMs: 10,
};

function loadSettings(): EditingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする
    return raw
      ? { ...DEFAULT_EDITING_SETTINGS, ...(JSON.parse(raw) as Partial<EditingSettings>) }
      : DEFAULT_EDITING_SETTINGS;
  } catch {
    return DEFAULT_EDITING_SETTINGS;
  }
}

type EditingSettingsState = {
  editingSettings: EditingSettings;
  setEditingSettings: (settings: EditingSettings) => void;
};

const EditingSettingsContext = createContext<EditingSettingsState | null>(null);

export function EditingSettingsProvider({ children }: { children: ReactNode }) {
  const [editingSettings, setEditingSettings] = useState<EditingSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(editingSettings));
  }, [editingSettings]);

  return (
    <EditingSettingsContext.Provider value={{ editingSettings, setEditingSettings }}>
      {children}
    </EditingSettingsContext.Provider>
  );
}

export function useEditingSettings(): EditingSettingsState {
  const context = useContext(EditingSettingsContext);
  if (!context) throw new Error("useEditingSettings must be used within an EditingSettingsProvider");
  return context;
}
