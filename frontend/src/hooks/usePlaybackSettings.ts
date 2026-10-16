import { useEffect, useState } from "react";
import type { PlaybackSettings } from "../types";

// 再生の速さ・音量は、作業中に聞きながらその場で変えるため、設定ダイアログではなく再生ボタンの横で変える。
// 同じ録音環境の音声を続けて扱うことが多いため、リロードしても残るようlocalStorageへ保存する
const STORAGE_KEY = "audio-labeler.playbackSettings";

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const MAX_VOLUME = 10;

const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  playbackRate: 1,
  volume: 1,
};

function loadPlaybackSettings(): PlaybackSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする
    return raw
      ? { ...DEFAULT_PLAYBACK_SETTINGS, ...(JSON.parse(raw) as Partial<PlaybackSettings>) }
      : DEFAULT_PLAYBACK_SETTINGS;
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
}

// 編集画面だけが使うため、Contextで共有はしない
export function usePlaybackSettings(): {
  playbackSettings: PlaybackSettings;
  setPlaybackRate: (playbackRate: number) => void;
  setVolume: (volume: number) => void;
} {
  const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>(loadPlaybackSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playbackSettings));
  }, [playbackSettings]);

  return {
    playbackSettings,
    setPlaybackRate: (playbackRate) => setPlaybackSettings((prev) => ({ ...prev, playbackRate })),
    setVolume: (volume) => setPlaybackSettings((prev) => ({ ...prev, volume })),
  };
}
