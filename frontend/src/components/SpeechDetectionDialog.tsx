import { useState } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import { Radio } from "./SettingFields";
import VadPresetSelect from "./VadPresetSelect";
import { useVadSettings } from "../hooks/useVadSettings";
import type { Segment, SpeechDetectionTarget } from "../types";

type SpeechDetectionFormProps = {
  selectedSegment: Segment | null;
  onRun: (presetId: string, targetSegment: Segment | null) => void;
  onCancel: () => void;
};

const TARGET_OPTIONS: { value: SpeechDetectionTarget; label: string }[] = [
  { value: "wholeAudio", label: "音声全体" },
  { value: "selectedSegment", label: "選んだ区間" },
];

function SpeechDetectionForm({ selectedSegment, onRun, onCancel }: SpeechDetectionFormProps) {
  const { vadSettings, lastUsedPresets } = useVadSettings();
  // 区間を選んでからボタンを押したなら、その区間を狙っていることが多いため、既定は選んだ区間にする
  const [target, setTarget] = useState<SpeechDetectionTarget>(selectedSegment ? "selectedSegment" : "wholeAudio");
  // 対象ごとに目的が違い使うプリセットも変わるため、対象を切り替えたらその対象で前回使ったものを出す。
  // 切り替えて戻ったときに選び直した分が消えないよう、対象ごとに持つ
  const [presetIds, setPresetIds] = useState<Record<SpeechDetectionTarget, string>>({
    wholeAudio: lastUsedPresets.wholeAudio.id,
    selectedSegment: lastUsedPresets.selectedSegment.id,
  });

  return (
    <form
      className="flex w-[min(440px,80vw)] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onRun(presetIds[target], target === "selectedSegment" ? selectedSegment : null);
      }}
    >
      {selectedSegment && (
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-gray-900">対象</div>
          {TARGET_OPTIONS.map((option) => (
            <Radio
              key={option.value}
              name="detectionTarget"
              checked={target === option.value}
              label={option.label}
              onSelect={() => setTarget(option.value)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="font-semibold text-gray-900">プリセット</div>
        <VadPresetSelect
          presets={vadSettings.presets}
          value={presetIds[target]}
          onChange={(id) => setPresetIds((prev) => ({ ...prev, [target]: id }))}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
        <Button variant="primary" type="submit" autoFocusInDialog>
          実行
        </Button>
      </div>
    </form>
  );
}

type SpeechDetectionDialogProps = {
  open: boolean;
  // ボタンを押したときに選んでいた区間。あれば対象(音声全体/選んだ区間)を選べるようにする
  selectedSegment: Segment | null;
  onRun: (presetId: string, targetSegment: Segment | null) => void;
  onCancel: () => void;
};

// 編集画面の「自動検出」ボタンで、使うプリセット(と、区間を選んでいるときは対象)を選んでから実行するダイアログ(PLAN.md 5章のVAD)。
// 初期値は(対象ごとに)前回使ったプリセットにし、変えるものがなければEnterで実行できるようにする
function SpeechDetectionDialog({ open, selectedSegment, onRun, onCancel }: SpeechDetectionDialogProps) {
  return (
    <Dialog open={open} title="自動検出" onClose={onCancel}>
      <SpeechDetectionForm selectedSegment={selectedSegment} onRun={onRun} onCancel={onCancel} />
    </Dialog>
  );
}

export default SpeechDetectionDialog;
