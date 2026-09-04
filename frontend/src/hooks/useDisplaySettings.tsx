import { createContext, useContext, useState, type ReactNode } from "react";

// 音声ファイルごとの状態(useAudioSession)とは異なり、ファイルを読み込み直しても保持したい
// 表示上の好み設定をここで管理する
export const MIN_MAIN_WAVEFORM_HEIGHT = 150;
export const MAX_MAIN_WAVEFORM_HEIGHT = 800;
export const DEFAULT_MAIN_WAVEFORM_HEIGHT = 600;

export const MIN_MINIMAP_HEIGHT = 30;
export const MAX_MINIMAP_HEIGHT = 150;
export const DEFAULT_MINIMAP_HEIGHT = 60;

type DisplaySettingsState = {
  mainWaveformHeight: number;
  setMainWaveformHeight: (height: number) => void;
  minimapHeight: number;
  setMinimapHeight: (height: number) => void;
};

const DisplaySettingsContext = createContext<DisplaySettingsState | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [mainWaveformHeight, setMainWaveformHeight] = useState(DEFAULT_MAIN_WAVEFORM_HEIGHT);
  const [minimapHeight, setMinimapHeight] = useState(DEFAULT_MINIMAP_HEIGHT);

  return (
    <DisplaySettingsContext.Provider
      value={{
        mainWaveformHeight,
        setMainWaveformHeight,
        minimapHeight,
        setMinimapHeight,
      }}
    >
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings(): DisplaySettingsState {
  const context = useContext(DisplaySettingsContext);
  if (!context) throw new Error("useDisplaySettings must be used within a DisplaySettingsProvider");
  return context;
}
