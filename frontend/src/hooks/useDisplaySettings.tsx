import { createContext, useContext, useState, type ReactNode } from "react";
import type { PlaybackScrollMode, SpectrogramColorMap } from "../types";

// 音声ファイルごとの状態(useAudioSession)とは異なり、ファイルを読み込み直しても保持したい
// 表示上の好み設定をここで管理する
export const MIN_MAIN_WAVEFORM_HEIGHT = 150;
export const MAX_MAIN_WAVEFORM_HEIGHT = 800;
export const DEFAULT_MAIN_WAVEFORM_HEIGHT = 600;

export const MIN_MINIMAP_HEIGHT = 30;
export const MAX_MINIMAP_HEIGHT = 150;
export const DEFAULT_MINIMAP_HEIGHT = 60;

export const MIN_SPECTROGRAM_HEIGHT = 100;
export const MAX_SPECTROGRAM_HEIGHT = 600;
export const DEFAULT_SPECTROGRAM_HEIGHT = 200;
// スペクトログラムの分析の窓の長さ(ミリ秒)の選択肢。短いほど時間方向が、長いほど周波数方向が細かくなる(PLAN.md 5章)
// 42msは、Audacityの既定(2048サンプル)に48kHzの音声で近い長さ(2048サンプルを超えるとFFTの点数が倍になり重くなるため、少し短くする)
export const SPECTROGRAM_WINDOW_MS_OPTIONS = [3, 5, 8, 15, 30, 42];
// 区間の境界を見るときは短い窓に切り替える
export const DEFAULT_SPECTROGRAM_WINDOW_MS = 42;
// 強さの差を色相で見分けやすいため、既定は色付きにする(PLAN.md 5章)
export const DEFAULT_SPECTROGRAM_COLOR_MAP: SpectrogramColorMap = "roseus";

// 中央で波形が流れ続けると、ラベルを付けたい位置を目で追いにくいため、既定はページ送りにする
export const DEFAULT_PLAYBACK_SCROLL_MODE: PlaybackScrollMode = "page";

type DisplaySettingsState = {
  mainWaveformHeight: number;
  setMainWaveformHeight: (height: number) => void;
  minimapHeight: number;
  setMinimapHeight: (height: number) => void;
  // スペクトログラムを出すとき(ヘッダーの「表示」メニューでオンにしたとき)の縦幅
  spectrogramHeight: number;
  setSpectrogramHeight: (height: number) => void;
  spectrogramColorMap: SpectrogramColorMap;
  setSpectrogramColorMap: (colorMap: SpectrogramColorMap) => void;
  spectrogramWindowMs: number;
  setSpectrogramWindowMs: (windowMs: number) => void;
  playbackScrollMode: PlaybackScrollMode;
  setPlaybackScrollMode: (mode: PlaybackScrollMode) => void;
};

const DisplaySettingsContext = createContext<DisplaySettingsState | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [mainWaveformHeight, setMainWaveformHeight] = useState(DEFAULT_MAIN_WAVEFORM_HEIGHT);
  const [minimapHeight, setMinimapHeight] = useState(DEFAULT_MINIMAP_HEIGHT);
  const [spectrogramHeight, setSpectrogramHeight] = useState(DEFAULT_SPECTROGRAM_HEIGHT);
  const [spectrogramColorMap, setSpectrogramColorMap] = useState(DEFAULT_SPECTROGRAM_COLOR_MAP);
  const [spectrogramWindowMs, setSpectrogramWindowMs] = useState(DEFAULT_SPECTROGRAM_WINDOW_MS);
  const [playbackScrollMode, setPlaybackScrollMode] = useState(DEFAULT_PLAYBACK_SCROLL_MODE);

  return (
    <DisplaySettingsContext.Provider
      value={{
        mainWaveformHeight,
        setMainWaveformHeight,
        minimapHeight,
        setMinimapHeight,
        spectrogramHeight,
        setSpectrogramHeight,
        spectrogramColorMap,
        setSpectrogramColorMap,
        spectrogramWindowMs,
        setSpectrogramWindowMs,
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
