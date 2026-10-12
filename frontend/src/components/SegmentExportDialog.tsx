import { useState, type ReactNode } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import { Checkbox, Radio } from "./SettingFields";
import { useAudioSession } from "../hooks/useAudioSession";
import { useLastSegmentExportChoices } from "../hooks/useLastSegmentExportChoices";
import { selectExportedSegments, useSegmentExport } from "../hooks/useSegmentExport";
import { useSegments } from "../hooks/useSegments";
import type { AudioFileInfo, SegmentExportChannel, SegmentExportChoices, SegmentExportSampleFormat } from "../types";

// 元より低いものだけを選べるようにする(元より高くしても音質は上がらないため。PLAN.md 5章)
const SAMPLE_RATE_OPTIONS = [48000, 44100, 22050, 16000, 8000];

const SAMPLE_FORMAT_OPTIONS: { value: SegmentExportSampleFormat; label: string }[] = [
  { value: "pcm16", label: "16 bit" },
  { value: "pcm24", label: "24 bit" },
  { value: "float32", label: "32 bit float" },
];

// select要素は値を文字列で持つため、選択肢の値を文字列に直して持たせる
const ORIGINAL = "original";

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-semibold text-gray-900">{title}</div>
      {children}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-fit rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// 前回選んだ内容のうち、この音声では選べないもの(ない番号のチャンネル、元以上のサンプリング周波数)は初期値に戻す
function adjustChoicesToAudio(choices: SegmentExportChoices, info: AudioFileInfo): SegmentExportChoices {
  return {
    ...choices,
    channel: typeof choices.channel === "number" && choices.channel >= info.channelCount ? "loaded" : choices.channel,
    sampleRate: choices.sampleRate !== null && choices.sampleRate >= info.sampleRate ? null : choices.sampleRate,
  };
}

type SegmentExportFormProps = {
  info: AudioFileInfo;
  onClose: () => void;
};

function SegmentExportForm({ info, onClose }: SegmentExportFormProps) {
  const { channel: loadedChannel } = useAudioSession();
  const { segments } = useSegments();
  const { lastChoices, saveChoices } = useLastSegmentExportChoices();
  const { isExporting, error, exportSegments } = useSegmentExport();
  const [choices, setChoices] = useState(() => adjustChoicesToAudio(lastChoices, info));
  const update = (patch: Partial<SegmentExportChoices>) => setChoices((current) => ({ ...current, ...patch }));

  const exportCount = selectExportedSegments(segments, choices.labeledOnly).length;
  const canExport = exportCount > 0 && !isExporting;

  const channelOptions = [
    { value: "loaded", label: `読み込んだチャンネル(ch ${loadedChannel})` },
    ...Array.from({ length: info.channelCount }, (_, i) => i)
      .filter((i) => i !== loadedChannel)
      .map((i) => ({ value: String(i), label: `ch ${i}` })),
    { value: "all", label: "すべてのチャンネル" },
  ];
  const originalBitDepth =
    info.bitDepth === null ? "" : info.isFloat ? `(${info.bitDepth} bit float)` : `(${info.bitDepth} bit)`;

  return (
    <form
      className="flex w-[min(480px,85vw)] flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canExport) return;
        saveChoices(choices);
        if (await exportSegments(choices)) onClose();
      }}
    >
      <Field title="対象">
        <Radio
          name="labeledOnly"
          checked={!choices.labeledOnly}
          label="すべての区間"
          onSelect={() => update({ labeledOnly: false })}
        />
        <Radio
          name="labeledOnly"
          checked={choices.labeledOnly}
          label="ラベルがある区間のみ"
          onSelect={() => update({ labeledOnly: true })}
        />
      </Field>

      {/* 1チャンネルなら選ぶ余地がないため出さない */}
      {info.channelCount > 1 && (
        <Field title="チャンネル">
          <Select
            value={String(choices.channel)}
            options={channelOptions}
            onChange={(value) =>
              update({
                channel: value === "loaded" || value === "all" ? value : (Number(value) as SegmentExportChannel),
              })
            }
          />
        </Field>
      )}

      <Field title="サンプリング周波数">
        <Select
          value={choices.sampleRate === null ? ORIGINAL : String(choices.sampleRate)}
          options={[
            { value: ORIGINAL, label: `元のまま(${info.sampleRate / 1000} kHz)` },
            ...SAMPLE_RATE_OPTIONS.filter((rate) => rate < info.sampleRate).map((rate) => ({
              value: String(rate),
              label: `${rate / 1000} kHz`,
            })),
          ]}
          onChange={(value) => update({ sampleRate: value === ORIGINAL ? null : Number(value) })}
        />
      </Field>

      <Field title="ビット深度">
        <Select
          value={choices.sampleFormat ?? ORIGINAL}
          options={[{ value: ORIGINAL, label: `元のまま${originalBitDepth}` }, ...SAMPLE_FORMAT_OPTIONS]}
          onChange={(value) =>
            update({ sampleFormat: value === ORIGINAL ? null : (value as SegmentExportSampleFormat) })
          }
        />
      </Field>

      <Field title="テキスト">
        <Checkbox
          checked={choices.includeLabels}
          label="ラベルも保存(text.txt)"
          onChange={(includeLabels) => update({ includeLabels })}
        />
        <div className="flex gap-4">
          <Radio
            name="delimiter"
            checked={choices.delimiter === "tab"}
            label="タブ区切り"
            onSelect={() => update({ delimiter: "tab" })}
          />
          <Radio
            name="delimiter"
            checked={choices.delimiter === "space"}
            label="スペース区切り"
            onSelect={() => update({ delimiter: "space" })}
          />
        </div>
      </Field>

      <Field title="id">
        <Checkbox checked={choices.zeroPadIds} label="ゼロ埋めする" onChange={(zeroPadIds) => update({ zeroPadIds })} />
      </Field>

      {error && <p className="m-0 text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        {/* 対象を切り替えると件数が変わるため、押したら何件書き出されるかをボタンで分かるようにする */}
        <Button variant="primary" type="submit" disabled={!canExport} autoFocusInDialog>
          {isExporting ? "書き出し中..." : `${exportCount}件を書き出す`}
        </Button>
      </div>
    </form>
  );
}

type SegmentExportDialogProps = {
  open: boolean;
  onClose: () => void;
};

// 区間ごとに音声を切り出してZIPで保存するダイアログ(PLAN.md 5章)。
// 各項目の初期値は前回選んだ内容にし、変えるものがなければEnterで書き出せるようにする
function SegmentExportDialog({ open, onClose }: SegmentExportDialogProps) {
  const { audioInfo } = useAudioSession();
  return (
    <Dialog open={open} title="音声を切り出す" onClose={onClose}>
      {audioInfo && <SegmentExportForm info={audioInfo} onClose={onClose} />}
    </Dialog>
  );
}

export default SegmentExportDialog;
