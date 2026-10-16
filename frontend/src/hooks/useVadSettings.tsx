import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SpeechDetectionTarget, VadParams, VadPreset, VadSettings } from "../types";

// 検出パラメータは音声の性質に合わせて調整して使い続けるものなので、ショートカット割り当てと同様に
// リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.vadSettings";
// 前回使ったプリセット(次の初期値にする)。音声全体は実行時のダイアログと読み込みのダイアログで共通。
// 音声全体のキーは、対象を分ける前に保存した値をそのまま引き継ぐため変えない
const LAST_USED_PRESET_STORAGE_KEYS: Record<SpeechDetectionTarget, string> = {
  wholeAudio: "audio-labeler.lastUsedVadPresetId",
  selectedSegment: "audio-labeler.lastUsedSegmentVadPresetId",
};

// 検出パラメータの初期値は、研究室で使ってきたspeech-splitter-with-vad(config/test/vad.yaml)に合わせる。
// そこで指定していない項目はSilero VADの既定値
export const DEFAULT_VAD_PARAMS: VadParams = {
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

const DEFAULT_PRESET: VadPreset = { id: "default", name: "デフォルト", params: DEFAULT_VAD_PARAMS };

// 既にある区間の扱いは、パラメータを変えて検出し直すときにそのまま使えるよう「すべて置き換える」を既定にする
// (「残す」だと、前回の検出結果と重なって何も足されないため)
const DEFAULT_VAD_SETTINGS: VadSettings = {
  existingSegmentsMode: "replaceAll",
  presets: [DEFAULT_PRESET],
};

// 消したプリセットを指していたときは先頭にする(プリセットは最低1つある)
export function findPresetOrFirst(presets: VadPreset[], id: string | null): VadPreset {
  return presets.find((p) => p.id === id) ?? presets[0];
}

// バックエンドでも同じ検証をしているが、設定ダイアログのOKの時点で気づけるようフロントでも検証する
export function findVadParamsError(params: VadParams): string | null {
  if (params.negThreshold !== null && params.negThreshold > params.threshold) {
    return "終了のしきい値は、しきい値以下にしてください";
  }
  return null;
}

// 実行するときに名前で選ぶため、空・重複は許さない
export function findVadPresetNameError(preset: VadPreset, presets: VadPreset[]): string | null {
  const name = preset.name.trim();
  if (name === "") return "名前を入れてください";
  if (presets.some((p) => p.id !== preset.id && p.name.trim() === name)) return "同じ名前のプリセットがあります";
  return null;
}

// 設定ダイアログで別のプリセットを開いていてもOKが押せない理由が分かるよう、どのプリセットの問題かを添える
export function findVadSettingsError(settings: VadSettings): string | null {
  for (const preset of settings.presets) {
    const error = findVadPresetNameError(preset, settings.presets) ?? findVadParamsError(preset.params);
    if (error) return preset.name.trim() === "" ? error : `「${preset.name}」: ${error}`;
  }
  return null;
}

function loadSettings(): VadSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VAD_SETTINGS;
    const saved = JSON.parse(raw) as Partial<VadSettings> & Partial<VadParams>;
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする。
    // プリセットを入れる前の設定は検出パラメータを直接持っているため、「デフォルト」のプリセットとして引き継ぐ
    const presets: VadPreset[] = Array.isArray(saved.presets)
      ? saved.presets.map((p) => ({ ...p, params: { ...DEFAULT_VAD_PARAMS, ...p.params } }))
      : [{ ...DEFAULT_PRESET, params: { ...DEFAULT_VAD_PARAMS, ...pickVadParams(saved) } }];
    const settings: VadSettings = {
      existingSegmentsMode: saved.existingSegmentsMode ?? DEFAULT_VAD_SETTINGS.existingSegmentsMode,
      presets: presets.length > 0 ? presets : DEFAULT_VAD_SETTINGS.presets,
    };
    // 候補(区間の確定・未確定の区別)をなくす前に保存した設定には、今はない選択肢(keepManual)が残っているため初期値に戻す
    if (settings.existingSegmentsMode !== "replaceAll" && settings.existingSegmentsMode !== "keepExisting") {
      settings.existingSegmentsMode = DEFAULT_VAD_SETTINGS.existingSegmentsMode;
    }
    return settings;
  } catch {
    return DEFAULT_VAD_SETTINGS;
  }
}

// 保存済みの値のうち、検出パラメータの項目だけを取り出す(既にある区間の扱いなどをパラメータに混ぜないため)
function pickVadParams(saved: Partial<VadParams>): Partial<VadParams> {
  const keys = Object.keys(DEFAULT_VAD_PARAMS) as (keyof VadParams)[];
  return Object.fromEntries(keys.filter((key) => key in saved).map((key) => [key, saved[key]]));
}

type LastUsedPresetIds = Record<SpeechDetectionTarget, string | null>;

function loadLastUsedPresetIds(): LastUsedPresetIds {
  try {
    return {
      wholeAudio: localStorage.getItem(LAST_USED_PRESET_STORAGE_KEYS.wholeAudio),
      selectedSegment: localStorage.getItem(LAST_USED_PRESET_STORAGE_KEYS.selectedSegment),
    };
  } catch {
    return { wholeAudio: null, selectedSegment: null };
  }
}

type VadSettingsState = {
  vadSettings: VadSettings;
  setVadSettings: (settings: VadSettings) => void;
  // 対象ごとの前回使ったプリセット。消されていたときは先頭のプリセット
  lastUsedPresets: Record<SpeechDetectionTarget, VadPreset>;
  setLastUsedPresetId: (target: SpeechDetectionTarget, id: string) => void;
};

const VadSettingsContext = createContext<VadSettingsState | null>(null);

export function VadSettingsProvider({ children }: { children: ReactNode }) {
  const [vadSettings, setVadSettings] = useState<VadSettings>(loadSettings);
  const [lastUsedPresetIds, setLastUsedPresetIds] = useState<LastUsedPresetIds>(loadLastUsedPresetIds);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vadSettings));
  }, [vadSettings]);

  useEffect(() => {
    for (const target of ["wholeAudio", "selectedSegment"] as const) {
      const id = lastUsedPresetIds[target];
      if (id !== null) localStorage.setItem(LAST_USED_PRESET_STORAGE_KEYS[target], id);
    }
  }, [lastUsedPresetIds]);

  return (
    <VadSettingsContext.Provider
      value={{
        vadSettings,
        setVadSettings,
        lastUsedPresets: {
          wholeAudio: findPresetOrFirst(vadSettings.presets, lastUsedPresetIds.wholeAudio),
          // 選んだ区間で一度も実行していないときは、音声全体で前回使ったものから始める
          selectedSegment: findPresetOrFirst(
            vadSettings.presets,
            lastUsedPresetIds.selectedSegment ?? lastUsedPresetIds.wholeAudio,
          ),
        },
        setLastUsedPresetId: (target, id) => setLastUsedPresetIds((prev) => ({ ...prev, [target]: id })),
      }}
    >
      {children}
    </VadSettingsContext.Provider>
  );
}

export function useVadSettings(): VadSettingsState {
  const context = useContext(VadSettingsContext);
  if (!context) throw new Error("useVadSettings must be used within a VadSettingsProvider");
  return context;
}
