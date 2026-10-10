import { useEffect, useRef, useState } from "react";
import {
  findConflict,
  formatKeyCombo,
  isSameKeyCombo,
  keyComboFromEvent,
  type KeyCombo,
  type ShortcutBindings,
  type ShortcutDef,
} from "../shortcuts/catalog";

// 単体の修飾キーはそれ自体では割り当てとして確定させず、実際のキーが押されるまで待つ
const MODIFIER_ONLY_KEYS = new Set(["control", "shift", "alt", "meta"]);

// 設定ダイアログのOKで確定するまでの下書き(bindings)を編集する。重なりの判定も下書きの割り当てに対して行う
type ShortcutBindingRowProps = {
  def: ShortcutDef;
  bindings: ShortcutBindings;
  onChange: (combo: KeyCombo) => void;
};

function ShortcutBindingRow({ def, bindings, onChange }: ShortcutBindingRowProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);

  const currentCombo = bindings[def.id];
  const isCustomized = !isSameKeyCombo(currentCombo, def.defaultCombo);

  // Escもショートカットとして割り当てられるよう、キー入力の受付はキーではなく、ボタンをもう一度押すか他の場所を押してやめる
  const toggleRecording = () => {
    setError(null);
    setRecording((prev) => !prev);
  };

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // キー入力の受付中は、Escで設定ダイアログ自体が閉じたりEnterでボタンが押されたりしないよう標準動作を止める
      e.preventDefault();
      if (MODIFIER_ONLY_KEYS.has(e.key.toLowerCase())) return;

      const combo = keyComboFromEvent(e);
      const conflictId = findConflict(bindings, def.id, combo);
      if (conflictId) {
        setError("このキーは既に他の操作に割り当てられています");
        return;
      }
      onChange(combo);
      setError(null);
      setRecording(false);
    };

    // ボタン自体を押したときはonClick(toggleRecording)に任せる
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && recordButtonRef.current?.contains(e.target)) return;
      setRecording(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [recording, def.id, bindings, onChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-52 shrink-0 text-gray-900">{def.label}</span>
      <button
        ref={recordButtonRef}
        type="button"
        onClick={toggleRecording}
        className="min-w-24 cursor-pointer rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-center font-mono text-sm text-gray-700 hover:bg-gray-100"
      >
        {recording ? "キーを入力..." : formatKeyCombo(currentCombo)}
      </button>
      {isCustomized && (
        <button
          type="button"
          onClick={() => {
            onChange(def.defaultCombo);
            setError(null);
          }}
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
        >
          デフォルトに戻す
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

export default ShortcutBindingRow;
