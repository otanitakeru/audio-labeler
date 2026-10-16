import { useState } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import VadPresetSelect from "./VadPresetSelect";
import { useVadSettings } from "../hooks/useVadSettings";

type SpeechDetectionFormProps = {
  onRun: (presetId: string) => void;
  onCancel: () => void;
};

function SpeechDetectionForm({ onRun, onCancel }: SpeechDetectionFormProps) {
  const { vadSettings, lastUsedPreset } = useVadSettings();
  const [presetId, setPresetId] = useState(lastUsedPreset.id);

  return (
    <form
      className="flex w-[min(440px,80vw)] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onRun(presetId);
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="font-semibold text-gray-900">プリセット</div>
        <VadPresetSelect presets={vadSettings.presets} value={presetId} onChange={setPresetId} />
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
  onRun: (presetId: string) => void;
  onCancel: () => void;
};

// 編集画面の「自動検出」ボタンで、使うプリセットを選んでから実行するダイアログ(PLAN.md 5章のVAD)。
// 初期値は前回使ったプリセットにし、変えるものがなければEnterで実行できるようにする
function SpeechDetectionDialog({ open, onRun, onCancel }: SpeechDetectionDialogProps) {
  return (
    <Dialog open={open} title="自動検出" onClose={onCancel}>
      <SpeechDetectionForm onRun={onRun} onCancel={onCancel} />
    </Dialog>
  );
}

export default SpeechDetectionDialog;
