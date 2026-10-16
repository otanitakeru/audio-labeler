import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DisplaySettings, PlaybackScrollMode, SpectrogramColorMap } from "../types";

// 音声ファイルごとの状態(useAudioSession)とは異なり、ファイルを読み込み直しても保持したい
// 表示上の好み設定をここで管理する。画面の大きさなどに合わせて一度決めたら使い続けるものなので、
// 他の設定と同様にリロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.displaySettings";

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

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mainWaveformHeight: DEFAULT_MAIN_WAVEFORM_HEIGHT,
  minimapHeight: DEFAULT_MINIMAP_HEIGHT,
  spectrogramHeight: DEFAULT_SPECTROGRAM_HEIGHT,
  spectrogramColorMap: DEFAULT_SPECTROGRAM_COLOR_MAP,
  spectrogramWindowMs: DEFAULT_SPECTROGRAM_WINDOW_MS,
  playbackScrollMode: DEFAULT_PLAYBACK_SCROLL_MODE,
};

function loadSettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする
    return raw
      ? { ...DEFAULT_DISPLAY_SETTINGS, ...(JSON.parse(raw) as Partial<DisplaySettings>) }
      : DEFAULT_DISPLAY_SETTINGS;
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

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
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(displaySettings));
  }, [displaySettings]);

  // 設定ダイアログのOKでは複数の項目を続けて変えるため、前の値を元に1項目ずつ更新する
  const setSetting =
    <K extends keyof DisplaySettings>(key: K) =>
    (value: DisplaySettings[K]) =>
      setDisplaySettings((prev) => ({ ...prev, [key]: value }));

  return (
    <DisplaySettingsContext.Provider
      value={{
        ...displaySettings,
        setMainWaveformHeight: setSetting("mainWaveformHeight"),
        setMinimapHeight: setSetting("minimapHeight"),
        setSpectrogramHeight: setSetting("spectrogramHeight"),
        setSpectrogramColorMap: setSetting("spectrogramColorMap"),
        setSpectrogramWindowMs: setSetting("spectrogramWindowMs"),
        setPlaybackScrollMode: setSetting("playbackScrollMode"),
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
