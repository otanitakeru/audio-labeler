import { useState } from "react";
import type { SegmentExportChoices } from "../types";

// 切り出しのたびに同じ選び方をすることが多いため、前回選んだ内容を次の切り出しのダイアログの初期値にする
// (読み込みのダイアログと同じ。PLAN.md 5章)。設定ダイアログには出さず、リロードしても残るようlocalStorageへ保存する
const STORAGE_KEY = "audio-labeler.lastSegmentExportChoices";

const DEFAULT_SEGMENT_EXPORT_CHOICES: SegmentExportChoices = {
  labeledOnly: false,
  channel: "loaded",
  sampleRate: null,
  sampleFormat: null,
  includeLabels: true,
  delimiter: "tab",
  zeroPadIds: true,
};

function loadChoices(): SegmentExportChoices {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの内容に無い項目は初期値で補えるようにする
    return raw
      ? { ...DEFAULT_SEGMENT_EXPORT_CHOICES, ...(JSON.parse(raw) as Partial<SegmentExportChoices>) }
      : DEFAULT_SEGMENT_EXPORT_CHOICES;
  } catch {
    return DEFAULT_SEGMENT_EXPORT_CHOICES;
  }
}

// 切り出しのダイアログだけが使い、開くたびに読めば足りるため、Contextで共有はしない。
// 開いている間の入力のたびに読み直さないよう、最初のレンダーで読んだ値を持ち続ける
export function useLastSegmentExportChoices(): {
  lastChoices: SegmentExportChoices;
  saveChoices: (choices: SegmentExportChoices) => void;
} {
  const [lastChoices] = useState(loadChoices);
  return {
    lastChoices,
    saveChoices: (choices) => localStorage.setItem(STORAGE_KEY, JSON.stringify(choices)),
  };
}
