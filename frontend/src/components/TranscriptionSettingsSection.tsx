import { Checkbox, Radio, SettingItem } from "./SettingFields";
import { DEFAULT_TRANSCRIPTION_SETTINGS, findTranscriptionSettingsError } from "../hooks/useTranscriptionSettings";
import type { TranscriptionSettings, TranscriptionTargetMode } from "../types";

const TARGET_MODE_OPTIONS: { value: TranscriptionTargetMode; label: string }[] = [
  { value: "unlabeledOrCandidates", label: "ラベルが空の区間と候補" },
  { value: "all", label: "すべての区間(ラベルがある区間も書き直す)" },
];

const TEXT_INPUT_CLASS_NAME = "rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900";

type TranscriptionSettingsSectionProps = {
  // 設定ダイアログのOKで確定するまでの下書き
  settings: TranscriptionSettings;
  onChange: (settings: TranscriptionSettings) => void;
};

// 設定ダイアログの「文字起こし」カテゴリ
function TranscriptionSettingsSection({ settings, onChange }: TranscriptionSettingsSectionProps) {
  const update = (patch: Partial<TranscriptionSettings>) => onChange({ ...settings, ...patch });
  const error = findTranscriptionSettingsError(settings);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
      <h2 className="m-0 text-xl font-semibold text-gray-900">文字起こし</h2>

      <SettingItem title="対象" description="文字起こしする区間です。">
        {TARGET_MODE_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            name="transcriptionTargetMode"
            checked={settings.targetMode === option.value}
            label={option.label}
            onSelect={() => update({ targetMode: option.value })}
          />
        ))}
      </SettingItem>

      <SettingItem
        title="モデル"
        description="Hugging Face のモデルIDです。初めて使うモデルはダウンロードに時間がかかります。"
      >
        <input
          type="text"
          spellCheck={false}
          value={settings.modelId}
          onChange={(e) => update({ modelId: e.target.value })}
          className={`w-96 ${TEXT_INPUT_CLASS_NAME}`}
        />
      </SettingItem>

      <SettingItem title="言語" description="言語コード(ja, en など)です。">
        <Checkbox
          checked={settings.language === null}
          label="自動判定"
          onChange={(auto) => update({ language: auto ? null : DEFAULT_TRANSCRIPTION_SETTINGS.language })}
        />
        {settings.language !== null && (
          <input
            type="text"
            spellCheck={false}
            value={settings.language}
            onChange={(e) => update({ language: e.target.value })}
            className={`w-24 ${TEXT_INPUT_CLASS_NAME}`}
          />
        )}
      </SettingItem>

      {error && <p className="m-0 text-sm text-red-600">{error}</p>}

      <div>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_TRANSCRIPTION_SETTINGS)}
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          デフォルトに戻す
        </button>
      </div>
    </div>
  );
}

export default TranscriptionSettingsSection;
