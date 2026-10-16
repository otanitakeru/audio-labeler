import { useState } from "react";
import Button from "./Button";
import NumberInput from "./NumberInput";
import ShortcutBindingRow from "./ShortcutBindingRow";
import TranscriptionSettingsSection from "./TranscriptionSettingsSection";
import VadSettingsSection from "./VadSettingsSection";
import {
  DEFAULT_MAIN_WAVEFORM_HEIGHT,
  DEFAULT_MINIMAP_HEIGHT,
  DEFAULT_SPECTROGRAM_HEIGHT,
  MAX_MAIN_WAVEFORM_HEIGHT,
  MAX_MINIMAP_HEIGHT,
  MAX_SPECTROGRAM_HEIGHT,
  MIN_MAIN_WAVEFORM_HEIGHT,
  MIN_MINIMAP_HEIGHT,
  MIN_SPECTROGRAM_HEIGHT,
  SPECTROGRAM_WINDOW_MS_OPTIONS,
  useDisplaySettings,
} from "../hooks/useDisplaySettings";
import {
  DEFAULT_EDITING_SETTINGS,
  MAX_SEGMENT_NUDGE_STEP_MS,
  MIN_SEGMENT_NUDGE_STEP_MS,
  useEditingSettings,
} from "../hooks/useEditingSettings";
import { useShortcutBindings } from "../hooks/useShortcutBindings";
import { findTranscriptionSettingsError, useTranscriptionSettings } from "../hooks/useTranscriptionSettings";
import { findVadSettingsError, useVadSettings } from "../hooks/useVadSettings";
import { SHORTCUT_CATALOG, SHORTCUT_GROUPS } from "../shortcuts/catalog";
import type { PlaybackScrollMode, SpectrogramColorMap } from "../types";

const PLAYBACK_SCROLL_MODE_OPTIONS: { value: PlaybackScrollMode; label: string }[] = [
  { value: "page", label: "端に来たらページ送り" },
  { value: "center", label: "カーソルを中央に保つ" },
  { value: "none", label: "動かさない" },
];

const SPECTROGRAM_COLOR_MAP_OPTIONS: { value: SpectrogramColorMap; label: string }[] = [
  { value: "gray", label: "灰色" },
  { value: "roseus", label: "Roseus" },
  { value: "viridis", label: "Viridis" },
];

const CATEGORIES = ["表示設定", "編集", "自動検出", "文字起こし", "ショートカットキー"] as const;
type Category = (typeof CATEGORIES)[number];

type HeightSettingProps = {
  title: string;
  description: string;
  min: number;
  max: number;
  defaultValue: number;
  value: number;
  onChange: (value: number) => void;
};

// 「表示設定」の縦幅の項目(波形・全体波形・スペクトログラムで共通)
function HeightSetting({ title, description, min, max, defaultValue, value, onChange }: HeightSettingProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-semibold text-gray-900">{title}</div>
      <p className="m-0 text-sm text-gray-500">{description}</p>
      <div className="flex flex-wrap items-center gap-3">
        <NumberInput unit="px" min={min} max={max} value={value} onChange={onChange} />
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          デフォルトに戻す
        </button>
      </div>
    </div>
  );
}

type SettingsPanelProps = {
  onClose: () => void;
};

// 変更はOKを押すまで下書き(draft*)にとどめ、OKでまとめて反映する。キャンセル・Esc・背景クリックで閉じたときは
// ダイアログごと中身が破棄されるため、下書きも捨てられる。波形の高さなどを変えるたびに背後の波形が読み込み直されるのも防げる
function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const {
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
  } = useDisplaySettings();
  const { bindings, setBindings } = useShortcutBindings();
  const { vadSettings, setVadSettings, lastUsedPreset } = useVadSettings();
  const { editingSettings, setEditingSettings } = useEditingSettings();
  const { transcriptionSettings, setTranscriptionSettings } = useTranscriptionSettings();

  const [draftMainWaveformHeight, setDraftMainWaveformHeight] = useState(mainWaveformHeight);
  const [draftMinimapHeight, setDraftMinimapHeight] = useState(minimapHeight);
  const [draftSpectrogramHeight, setDraftSpectrogramHeight] = useState(spectrogramHeight);
  const [draftSpectrogramColorMap, setDraftSpectrogramColorMap] = useState(spectrogramColorMap);
  const [draftSpectrogramWindowMs, setDraftSpectrogramWindowMs] = useState(spectrogramWindowMs);
  const [draftPlaybackScrollMode, setDraftPlaybackScrollMode] = useState(playbackScrollMode);
  const [draftBindings, setDraftBindings] = useState(bindings);
  const [draftVadSettings, setDraftVadSettings] = useState(vadSettings);
  // 開いたときは、いつも使っているものを直しやすいよう前回使ったプリセットを出す
  const [editingVadPresetId, setEditingVadPresetId] = useState(lastUsedPreset.id);
  const [draftEditingSettings, setDraftEditingSettings] = useState(editingSettings);
  const [draftTranscriptionSettings, setDraftTranscriptionSettings] = useState(transcriptionSettings);

  const vadSettingsError = findVadSettingsError(draftVadSettings);
  const transcriptionSettingsError = findTranscriptionSettingsError(draftTranscriptionSettings);
  // 別のカテゴリを開いていてもOKが押せない理由が分かるよう、下のボタンの横にも出す
  const settingsError = vadSettingsError
    ? `自動検出: ${vadSettingsError}`
    : transcriptionSettingsError && `文字起こし: ${transcriptionSettingsError}`;

  const applyAndClose = () => {
    setMainWaveformHeight(draftMainWaveformHeight);
    setMinimapHeight(draftMinimapHeight);
    setSpectrogramHeight(draftSpectrogramHeight);
    setSpectrogramColorMap(draftSpectrogramColorMap);
    setSpectrogramWindowMs(draftSpectrogramWindowMs);
    setPlaybackScrollMode(draftPlaybackScrollMode);
    setBindings(draftBindings);
    setVadSettings(draftVadSettings);
    setEditingSettings(draftEditingSettings);
    setTranscriptionSettings(draftTranscriptionSettings);
    onClose();
  };

  return (
    // カテゴリを切り替えてもダイアログの大きさが変わらないよう、大きさを固定する
    <div className="flex h-[min(760px,75vh)] w-[min(1080px,85vw)] flex-col gap-5">
      <div className="flex min-h-0 flex-1 gap-8">
        <nav className="w-48 shrink-0 border-r border-gray-300 pr-4">
          <ul className="flex flex-col gap-1">
            {CATEGORIES.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`w-full cursor-pointer rounded px-2 py-1 text-left font-semibold ${
                    c === category ? "bg-gray-200 text-gray-900" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {category === "表示設定" && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <h2 className="m-0 text-xl font-semibold text-gray-900">表示設定</h2>

            <HeightSetting
              title="波形の高さ"
              description="編集画面で拡大表示する波形の縦幅を調整します。"
              min={MIN_MAIN_WAVEFORM_HEIGHT}
              max={MAX_MAIN_WAVEFORM_HEIGHT}
              defaultValue={DEFAULT_MAIN_WAVEFORM_HEIGHT}
              value={draftMainWaveformHeight}
              onChange={setDraftMainWaveformHeight}
            />

            <HeightSetting
              title="全体波形の高さ"
              description="音声全体を縮小表示する波形(現在の表示範囲がハイライトされます)の縦幅を調整します。"
              min={MIN_MINIMAP_HEIGHT}
              max={MAX_MINIMAP_HEIGHT}
              defaultValue={DEFAULT_MINIMAP_HEIGHT}
              value={draftMinimapHeight}
              onChange={setDraftMinimapHeight}
            />

            <HeightSetting
              title="スペクトログラムの高さ"
              description="「表示」メニューでスペクトログラムをオンにしたときの縦幅を調整します。"
              min={MIN_SPECTROGRAM_HEIGHT}
              max={MAX_SPECTROGRAM_HEIGHT}
              defaultValue={DEFAULT_SPECTROGRAM_HEIGHT}
              value={draftSpectrogramHeight}
              onChange={setDraftSpectrogramHeight}
            />

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">スペクトログラムの色</div>
              {SPECTROGRAM_COLOR_MAP_OPTIONS.map((option) => (
                <label key={option.value} className="inline-flex cursor-pointer items-center gap-2 text-gray-900">
                  <input
                    type="radio"
                    name="spectrogramColorMap"
                    checked={draftSpectrogramColorMap === option.value}
                    onChange={() => setDraftSpectrogramColorMap(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">スペクトログラムの窓の長さ</div>
              <p className="m-0 text-sm text-gray-500">短いほど時間方向が、長いほど周波数方向が細かくなります。</p>
              {SPECTROGRAM_WINDOW_MS_OPTIONS.map((windowMs) => (
                <label key={windowMs} className="inline-flex cursor-pointer items-center gap-2 text-gray-900">
                  <input
                    type="radio"
                    name="spectrogramWindowMs"
                    checked={draftSpectrogramWindowMs === windowMs}
                    onChange={() => setDraftSpectrogramWindowMs(windowMs)}
                  />
                  {windowMs} ms
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">再生中の表示</div>
              <p className="m-0 text-sm text-gray-500">再生中、カーソルが進んでいくときの表示位置の動かし方です。</p>
              {PLAYBACK_SCROLL_MODE_OPTIONS.map((option) => (
                <label key={option.value} className="inline-flex cursor-pointer items-center gap-2 text-gray-900">
                  <input
                    type="radio"
                    name="playbackScrollMode"
                    checked={draftPlaybackScrollMode === option.value}
                    onChange={() => setDraftPlaybackScrollMode(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {category === "編集" && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <h2 className="m-0 text-xl font-semibold text-gray-900">編集</h2>

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">境界をずらす量</div>
              <p className="m-0 text-sm text-gray-500">
                開始・終了をずらすショートカット1回あたりの移動量です。押し続けると段階的に速くなります。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <NumberInput
                  unit="ms"
                  min={MIN_SEGMENT_NUDGE_STEP_MS}
                  max={MAX_SEGMENT_NUDGE_STEP_MS}
                  value={draftEditingSettings.segmentNudgeStepMs}
                  onChange={(segmentNudgeStepMs) =>
                    setDraftEditingSettings((prev) => ({ ...prev, segmentNudgeStepMs }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraftEditingSettings((prev) => ({
                      ...prev,
                      segmentNudgeStepMs: DEFAULT_EDITING_SETTINGS.segmentNudgeStepMs,
                    }))
                  }
                  className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  デフォルトに戻す
                </button>
              </div>
            </div>
          </div>
        )}

        {category === "自動検出" && (
          <VadSettingsSection
            settings={draftVadSettings}
            onChange={setDraftVadSettings}
            editingPresetId={editingVadPresetId}
            onChangeEditingPresetId={setEditingVadPresetId}
          />
        )}

        {category === "文字起こし" && (
          <TranscriptionSettingsSection
            settings={draftTranscriptionSettings}
            onChange={setDraftTranscriptionSettings}
          />
        )}

        {category === "ショートカットキー" && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <h2 className="m-0 text-xl font-semibold text-gray-900">ショートカットキー</h2>

            {SHORTCUT_GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-3">
                <div className="font-semibold text-gray-900">{group}</div>
                {SHORTCUT_CATALOG.filter((def) => def.group === group).map((def) => (
                  <ShortcutBindingRow
                    key={def.id}
                    def={def}
                    bindings={draftBindings}
                    onChange={(combo) => setDraftBindings((prev) => ({ ...prev, [def.id]: combo }))}
                  />
                ))}
              </div>
            ))}

            <p className="m-0 text-sm text-gray-500">Cmd(Ctrl) + スクロールで波形を横方向に拡大/縮小できます。</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-300 pt-4">
        {settingsError && <p className="m-0 mr-auto text-sm text-red-600">{settingsError}</p>}
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button variant="primary" onClick={applyAndClose} disabled={settingsError !== null}>
          OK
        </Button>
      </div>
    </div>
  );
}

export default SettingsPanel;
