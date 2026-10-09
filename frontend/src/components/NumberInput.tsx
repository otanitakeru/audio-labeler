import { useState } from "react";

type NumberInputProps = {
  unit?: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
};

// 入力のたびに範囲内へ丸めると、300と打つ途中の「3」が最小値に置き換わって打てなくなるため、
// 入力中は文字列のまま持ち、フォーカスが外れたときに範囲内へ丸めて確定する
function NumberInput({ unit, min, max, value, onChange }: NumberInputProps) {
  // nullは入力中でないことを表す(親から渡された値をそのまま表示する)
  const [editingText, setEditingText] = useState<string | null>(null);

  const commit = () => {
    if (editingText === null) return;
    const parsed = Number(editingText);
    // 空欄や数値でない入力は、元の値に戻す
    if (editingText.trim() !== "" && Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setEditingText(null);
  };

  return (
    <label className="inline-flex items-center gap-2 text-gray-900">
      <input
        type="number"
        min={min}
        max={max}
        value={editingText ?? value}
        onChange={(e) => setEditingText(e.target.value)}
        onBlur={commit}
        className="w-24 rounded-md border border-gray-300 bg-white px-2 py-2"
      />
      {unit}
    </label>
  );
}

export default NumberInput;
