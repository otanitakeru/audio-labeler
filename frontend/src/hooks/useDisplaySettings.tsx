import { createContext, useContext, useState, type ReactNode } from "react";
import type { PlaybackScrollMode } from "../types";

// 音声ファイルごとの状態(useAudioSession)とは異なり、ファイルを読み込み直しても保持したい
// 表示上の好み設定をここで管理する
export const MIN_MAIN_WAVEFORM_HEIGHT = 150;
export const MAX_MAIN_WAVEFORM_HEIGHT = 800;
export const DEFAULT_MAIN_WAVEFORM_HEIGHT = 600;

export const MIN_MINIMAP_HEIGHT = 30;
export const MAX_MINIMAP_HEIGHT = 150;
export const DEFAULT_MINIMAP_HEIGHT = 60;

// 中央で波形が流れ続けると、ラベルを付けたい位置を目で追いにくいため、既定はページ送りにする
export const DEFAULT_PLAYBACK_SCROLL_MODE: PlaybackScrollMode = "page";

type DisplaySettingsState = {
  mainWaveformHeight: number;
  setMainWaveformHeight: (height: number) => void;
  minimapHeight: number;
  setMinimapHeight: (height: number) => void;
  playbackScrollMode: PlaybackScrollMode;
  setPlaybackScrollMode: (mode: PlaybackScrollMode) => void;
};

const DisplaySettingsContext = createContext<DisplaySettingsState | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [mainWaveformHeight, setMainWaveformHeight] = useState(DEFAULT_MAIN_WAVEFORM_HEIGHT);
  const [minimapHeight, setMinimapHeight] = useState(DEFAULT_MINIMAP_HEIGHT);
  const [playbackScrollMode, setPlaybackScrollMode] = useState(DEFAULT_PLAYBACK_SCROLL_MODE);

  return (
    <DisplaySettingsContext.Provider
      value={{
        mainWaveformHeight,
        setMainWaveformHeight,
        minimapHeight,
        setMinimapHeight,
        playbackScrollMode,
        setPlaybackScrollMode,
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
