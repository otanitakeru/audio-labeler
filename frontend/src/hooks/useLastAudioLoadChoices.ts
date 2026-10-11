import { useState } from "react";
import type { AudioLoadChoices } from "../types";

// 読み込みのたびに同じ選び方をすることが多いため、前回選んだ内容を次の読み込みのダイアログの初期値にする。
// 設定ダイアログには出さず、リロードしても残るようlocalStorageへ保存する
const STORAGE_KEY = "audio-labeler.lastAudioLoadChoices";

const DEFAULT_AUDIO_LOAD_CHOICES: AudioLoadChoices = {
  channel: 0,
  afterLoadProcessing: "none",
};

function loadChoices(): AudioLoadChoices {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの内容に無い項目は初期値で補えるようにする
    return raw
      ? { ...DEFAULT_AUDIO_LOAD_CHOICES, ...(JSON.parse(raw) as Partial<AudioLoadChoices>) }
      : DEFAULT_AUDIO_LOAD_CHOICES;
  } catch {
    return DEFAULT_AUDIO_LOAD_CHOICES;
  }
}

// 読み込みのダイアログだけが使い、開くたびに読めば足りるため、Contextで共有はしない。
// 開いている間の入力のたびに読み直さないよう、最初のレンダーで読んだ値を持ち続ける
export function useLastAudioLoadChoices(): {
  lastChoices: AudioLoadChoices;
  saveChoices: (choices: AudioLoadChoices) => void;
} {
  const [lastChoices] = useState(loadChoices);
  return {
    lastChoices,
    saveChoices: (choices) => localStorage.setItem(STORAGE_KEY, JSON.stringify(choices)),
  };
}
