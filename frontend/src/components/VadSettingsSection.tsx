import NumberInput from "./NumberInput";
import { Checkbox, Radio, SettingItem } from "./SettingFields";
import {
  DEFAULT_VAD_PARAMS,
  findPresetOrFirst,
  findVadParamsError,
  findVadPresetNameError,
} from "../hooks/useVadSettings";
import type { ExistingSegmentsMode, VadParams, VadPreset, VadSettings } from "../types";

const EXISTING_SEGMENTS_MODE_OPTIONS: { value: ExistingSegmentsMode; label: string }[] = [
  { value: "replaceAll", label: "すべて置き換える" },
  { value: "keepExisting", label: "残し、重ならない区間だけ足す" },
];

const SAMPLING_RATE_OPTIONS: { value: VadParams["samplingRate"]; label: string }[] = [
  { value: 16000, label: "16000 Hz" },
  { value: 8000, label: "8000 Hz" },
];

// 「自動」「無制限」から具体的な値の指定に切り替えたときの初期値
const NEG_THRESHOLD_OFFSET = 0.15;
const DEFAULT_MAX_SPEECH_DURATION_S = 30;

const NEW_PRESET_NAME = "新しいプリセット";

// 追加したプリセットの名前。名前の重複は許さないため、既にあれば番号を付ける
function makeNewPresetName(presets: VadPreset[]): string {
  const names = new Set(presets.map((p) => p.name.trim()));
  if (!names.has(NEW_PRESET_NAME)) return NEW_PRESET_NAME;
  let n = 2;
  while (names.has(`${NEW_PRESET_NAME} ${n}`)) n++;
  return `${NEW_PRESET_NAME} ${n}`;
}

type VadSettingsSectionProps = {
  // 設定ダイアログのOKで確定するまでの下書き
  settings: VadSettings;
  onChange: (settings: VadSettings) => void;
  // 名前と値を表示・編集しているプリセット。カテゴリを切り替えても保つよう、設定ダイアログ側で持つ
  editingPresetId: string;
  onChangeEditingPresetId: (presetId: string) => void;
};

// 設定ダイアログの「自動検出」カテゴリ。プリセットの追加・削除と、Silero VADの検出結果に影響するパラメータ・
// このアプリ独自の後処理(検出後の結合)をすべてここで変えられる
function VadSettingsSection({ settings, onChange, editingPresetId, onChangeEditingPresetId }: VadSettingsSectionProps) {
  const preset = findPresetOrFirst(settings.presets, editingPresetId);
  const params = preset.params;
  const updatePreset = (patch: Partial<VadPreset>) =>
    onChange({ ...settings, presets: settings.presets.map((p) => (p.id === preset.id ? { ...p, ...patch } : p)) });
  const update = (patch: Partial<VadParams>) => updatePreset({ params: { ...params, ...patch } });
  const error = findVadParamsError(params);
  const nameError = findVadPresetNameError(preset, settings.presets);
  const isMaxSpeechUnlimited = params.maxSpeechDurationS === null;

  // 今表示しているプリセットの値を写して作る(少し変えた組を作ることが多いため)
  const addPreset = () => {
    const added: VadPreset = { id: crypto.randomUUID(), name: makeNewPresetName(settings.presets), params };
    onChange({ ...settings, presets: [...settings.presets, added] });
    onChangeEditingPresetId(added.id);
  };

  // 開いているプリセットを消したときは、一覧で同じ位置(末尾なら1つ前)のプリセットを開く
  const deletePreset = (id: string) => {
    const index = settings.presets.findIndex((p) => p.id === id);
    const presets = settings.presets.filter((p) => p.id !== id);
    onChange({ ...settings, presets });
    if (id === preset.id) onChangeEditingPresetId(presets[Math.min(index, presets.length - 1)].id);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
      <h2 className="m-0 text-xl font-semibold text-gray-900">自動検出</h2>

      <SettingItem title="既にある区間" description="自動検出を実行したときの、既にある区間の扱いです。">
        {EXISTING_SEGMENTS_MODE_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            name="existingSegmentsMode"
            checked={settings.existingSegmentsMode === option.value}
            label={option.label}
            onSelect={() => onChange({ ...settings, existingSegmentsMode: option.value })}
          />
        ))}
      </SettingItem>

      <h3 className="m-0 border-t border-gray-200 pt-5 text-lg font-semibold text-gray-900">プリセット</h3>

      {/* どの値がどのプリセットのものかが分かるよう、一覧と選んだプリセットの中身を左右に並べ、中身は枠で囲む */}
      <div className="flex items-start gap-5">
        {/* 下の値を見ながら別のプリセットへ切り替えられるよう、スクロールしても一覧は上に残す */}
        <div className="sticky top-0 flex w-44 shrink-0 flex-col gap-1">
          {settings.presets.map((p) => {
            const isSelected = p.id === preset.id;
            // 直すところがあるプリセットは、開いていなくても一覧で分かるよう赤字にする
            const hasError =
              findVadPresetNameError(p, settings.presets) !== null || findVadParamsError(p.params) !== null;
            const textColor = hasError ? "text-red-600" : isSelected ? "text-gray-900" : "text-gray-700";
            return (
              <div
                key={p.id}
                className={`group flex items-center rounded ${isSelected ? "bg-gray-200" : "hover:bg-gray-100"}`}
              >
                <button
                  type="button"
                  onClick={() => onChangeEditingPresetId(p.id)}
                  className={`min-w-0 flex-1 cursor-pointer truncate px-3 py-2 text-left ${textColor} ${
                    isSelected ? "font-semibold" : ""
                  }`}
                >
                  {p.name.trim() === "" ? "(名前なし)" : p.name}
                </button>
                {/* 一覧が並んでうるさくならないよう、開いている行とカーソルを当てた行だけに出す。
                    実行するときに選ぶものがなくならないよう、最後の1つは消せない */}
                {settings.presets.length > 1 && (
                  <button
                    type="button"
                    aria-label={`${p.name}を削除`}
                    onClick={() => deletePreset(p.id)}
                    className={`mr-1 cursor-pointer rounded px-2 py-1 leading-none text-gray-500 hover:bg-gray-300 hover:text-gray-900 ${
                      isSelected ? "" : "invisible group-hover:visible"
                    }`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addPreset}
            className="w-full cursor-pointer rounded px-3 py-2 text-left text-gray-500 hover:bg-gray-100"
          >
            + 追加
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-6 rounded-lg border border-gray-300 p-5">
          <SettingItem title="名前">
            <input
              type="text"
              spellCheck={false}
              value={preset.name}
              onChange={(e) => updatePreset({ name: e.target.value })}
              className="w-64 rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900"
            />
            {nameError && <p className="m-0 text-sm text-red-600">{nameError}</p>}
          </SettingItem>

          <h4 className="m-0 border-t border-gray-200 pt-5 text-base font-semibold text-gray-900">検出</h4>

          <SettingItem title="サンプリングレート" description="音声をこのレートに変換してから判定します。">
            {SAMPLING_RATE_OPTIONS.map((option) => (
              <Radio
                key={option.value}
                name="samplingRate"
                checked={params.samplingRate === option.value}
                label={option.label}
                onSelect={() => update({ samplingRate: option.value })}
              />
            ))}
          </SettingItem>

          <SettingItem title="しきい値" description="発話らしさがこれを超えると、発話とみなします。">
            <NumberInput
              min={0.05}
              max={0.95}
              step={0.05}
              value={params.threshold}
              onChange={(threshold) => update({ threshold })}
            />
          </SettingItem>

          <SettingItem
            title="終了のしきい値"
            description="発話中に発話らしさがこれを下回ると、発話の終わりとみなします。"
          >
            <Checkbox
              checked={params.negThreshold === null}
              label={`自動(しきい値 − ${NEG_THRESHOLD_OFFSET})`}
              onChange={(auto) =>
                update({
                  negThreshold: auto
                    ? null
                    : Math.max(0.01, Number((params.threshold - NEG_THRESHOLD_OFFSET).toFixed(2))),
                })
              }
            />
            {params.negThreshold !== null && (
              <NumberInput
                min={0.01}
                max={0.95}
                step={0.05}
                value={params.negThreshold}
                onChange={(negThreshold) => update({ negThreshold })}
              />
            )}
            {error && <p className="m-0 text-sm text-red-600">{error}</p>}
          </SettingItem>

          <SettingItem title="最短の発話" description="これより短い発話は検出しません。">
            <NumberInput
              unit="ms"
              min={0}
              max={5000}
              step={50}
              value={params.minSpeechDurationMs}
              onChange={(minSpeechDurationMs) => update({ minSpeechDurationMs })}
            />
          </SettingItem>

          <SettingItem title="最短の無音" description="これより短い無音では区間を分けません。">
            <NumberInput
              unit="ms"
              min={0}
              max={5000}
              step={50}
              value={params.minSilenceDurationMs}
              onChange={(minSilenceDurationMs) => update({ minSilenceDurationMs })}
            />
          </SettingItem>

          <SettingItem title="前後の余白" description="検出した区間の前後に足す長さです。">
            <NumberInput
              unit="ms"
              min={0}
              max={1000}
              step={10}
              value={params.speechPadMs}
              onChange={(speechPadMs) => update({ speechPadMs })}
            />
          </SettingItem>

          <h4 className="m-0 border-t border-gray-200 pt-5 text-base font-semibold text-gray-900">長い発話の分割</h4>

          <SettingItem title="最長の発話" description="これより長い発話は、途中で分割します。">
            <Checkbox
              checked={isMaxSpeechUnlimited}
              label="無制限"
              onChange={(unlimited) => update({ maxSpeechDurationS: unlimited ? null : DEFAULT_MAX_SPEECH_DURATION_S })}
            />
            {!isMaxSpeechUnlimited && (
              <NumberInput
                unit="秒"
                min={1}
                max={600}
                value={params.maxSpeechDurationS ?? DEFAULT_MAX_SPEECH_DURATION_S}
                onChange={(maxSpeechDurationS) => update({ maxSpeechDurationS })}
              />
            )}
          </SettingItem>

          <SettingItem title="分割に使う最短の無音" description="分割するとき、この長さ以上の無音の位置で分けます。">
            <NumberInput
              unit="ms"
              min={0}
              max={5000}
              step={10}
              disabled={isMaxSpeechUnlimited}
              value={params.minSilenceAtMaxSpeechMs}
              onChange={(minSilenceAtMaxSpeechMs) => update({ minSilenceAtMaxSpeechMs })}
            />
            <Checkbox
              checked={params.useMaxPossibleSilenceAtMaxSpeech}
              disabled={isMaxSpeechUnlimited}
              label="できるだけ長い無音の位置で分ける"
              onChange={(useMaxPossibleSilenceAtMaxSpeech) => update({ useMaxPossibleSilenceAtMaxSpeech })}
            />
          </SettingItem>

          <h4 className="m-0 border-t border-gray-200 pt-5 text-base font-semibold text-gray-900">検出後の結合</h4>

          <SettingItem
            title="結合する無音の長さ"
            description="前後の余白を足したあと、間の無音がこれより短い区間をつなげます。0 なら結合しません。"
          >
            <NumberInput
              unit="ms"
              min={0}
              max={5000}
              step={50}
              value={params.minSilenceAfterVadMs}
              onChange={(minSilenceAfterVadMs) => update({ minSilenceAfterVadMs })}
            />
          </SettingItem>

          <div className="border-t border-gray-200 pt-5">
            <button
              type="button"
              // 名前はそのままで、選んでいるプリセットの値だけを戻す
              onClick={() => updatePreset({ params: DEFAULT_VAD_PARAMS })}
              className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              値をデフォルトに戻す
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VadSettingsSection;
