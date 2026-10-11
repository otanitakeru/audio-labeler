import NumberInput from "./NumberInput";
import { Checkbox, Radio, SettingItem } from "./SettingFields";
import { DEFAULT_VAD_SETTINGS, findVadSettingsError } from "../hooks/useVadSettings";
import type { ExistingSegmentsMode, VadSettings } from "../types";

const EXISTING_SEGMENTS_MODE_OPTIONS: { value: ExistingSegmentsMode; label: string }[] = [
  { value: "replaceAll", label: "すべて置き換える" },
  { value: "keepExisting", label: "残し、重ならない区間だけ足す" },
];

const SAMPLING_RATE_OPTIONS: { value: VadSettings["samplingRate"]; label: string }[] = [
  { value: 16000, label: "16000 Hz" },
  { value: 8000, label: "8000 Hz" },
];

// 「自動」「無制限」から具体的な値の指定に切り替えたときの初期値
const NEG_THRESHOLD_OFFSET = 0.15;
const DEFAULT_MAX_SPEECH_DURATION_S = 30;

type VadSettingsSectionProps = {
  // 設定ダイアログのOKで確定するまでの下書き
  settings: VadSettings;
  onChange: (settings: VadSettings) => void;
};

// 設定ダイアログの「自動検出」カテゴリ。Silero VADの検出結果に影響するパラメータと、このアプリ独自の後処理(検出後の結合)を
// すべてここで変えられる
function VadSettingsSection({ settings, onChange }: VadSettingsSectionProps) {
  const update = (patch: Partial<VadSettings>) => onChange({ ...settings, ...patch });
  const error = findVadSettingsError(settings);
  const isMaxSpeechUnlimited = settings.maxSpeechDurationS === null;

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
            onSelect={() => update({ existingSegmentsMode: option.value })}
          />
        ))}
      </SettingItem>

      <h3 className="m-0 border-t border-gray-200 pt-5 text-lg font-semibold text-gray-900">検出</h3>

      <SettingItem title="サンプリングレート" description="音声をこのレートに変換してから判定します。">
        {SAMPLING_RATE_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            name="samplingRate"
            checked={settings.samplingRate === option.value}
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
          value={settings.threshold}
          onChange={(threshold) => update({ threshold })}
        />
      </SettingItem>

      <SettingItem title="終了のしきい値" description="発話中に発話らしさがこれを下回ると、発話の終わりとみなします。">
        <Checkbox
          checked={settings.negThreshold === null}
          label={`自動(しきい値 − ${NEG_THRESHOLD_OFFSET})`}
          onChange={(auto) =>
            update({
              negThreshold: auto
                ? null
                : Math.max(0.01, Number((settings.threshold - NEG_THRESHOLD_OFFSET).toFixed(2))),
            })
          }
        />
        {settings.negThreshold !== null && (
          <NumberInput
            min={0.01}
            max={0.95}
            step={0.05}
            value={settings.negThreshold}
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
          value={settings.minSpeechDurationMs}
          onChange={(minSpeechDurationMs) => update({ minSpeechDurationMs })}
        />
      </SettingItem>

      <SettingItem title="最短の無音" description="これより短い無音では区間を分けません。">
        <NumberInput
          unit="ms"
          min={0}
          max={5000}
          step={50}
          value={settings.minSilenceDurationMs}
          onChange={(minSilenceDurationMs) => update({ minSilenceDurationMs })}
        />
      </SettingItem>

      <SettingItem title="前後の余白" description="検出した区間の前後に足す長さです。">
        <NumberInput
          unit="ms"
          min={0}
          max={1000}
          step={10}
          value={settings.speechPadMs}
          onChange={(speechPadMs) => update({ speechPadMs })}
        />
      </SettingItem>

      <h3 className="m-0 border-t border-gray-200 pt-5 text-lg font-semibold text-gray-900">長い発話の分割</h3>

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
            value={settings.maxSpeechDurationS ?? DEFAULT_MAX_SPEECH_DURATION_S}
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
          value={settings.minSilenceAtMaxSpeechMs}
          onChange={(minSilenceAtMaxSpeechMs) => update({ minSilenceAtMaxSpeechMs })}
        />
        <Checkbox
          checked={settings.useMaxPossibleSilenceAtMaxSpeech}
          disabled={isMaxSpeechUnlimited}
          label="できるだけ長い無音の位置で分ける"
          onChange={(useMaxPossibleSilenceAtMaxSpeech) => update({ useMaxPossibleSilenceAtMaxSpeech })}
        />
      </SettingItem>

      <h3 className="m-0 border-t border-gray-200 pt-5 text-lg font-semibold text-gray-900">検出後の結合</h3>

      <SettingItem
        title="結合する無音の長さ"
        description="前後の余白を足したあと、間の無音がこれより短い区間をつなげます。0 なら結合しません。"
      >
        <NumberInput
          unit="ms"
          min={0}
          max={5000}
          step={50}
          value={settings.minSilenceAfterVadMs}
          onChange={(minSilenceAfterVadMs) => update({ minSilenceAfterVadMs })}
        />
      </SettingItem>

      <div>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_VAD_SETTINGS)}
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          デフォルトに戻す
        </button>
      </div>
    </div>
  );
}

export default VadSettingsSection;
