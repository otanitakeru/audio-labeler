import type { VadPreset } from "../types";

type VadPresetSelectProps = {
  presets: VadPreset[];
  value: string;
  onChange: (presetId: string) => void;
};

// 自動検出のプリセットを名前で選ぶ欄。実行時のダイアログ・読み込みのダイアログで共有し、選び方を揃える
function VadPresetSelect({ presets, value, onChange }: VadPresetSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900"
    >
      {presets.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.name}
        </option>
      ))}
    </select>
  );
}

export default VadPresetSelect;
