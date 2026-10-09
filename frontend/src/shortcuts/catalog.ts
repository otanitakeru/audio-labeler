// キーボードショートカットの定義(データ層)。
// ここにIDと表示名・初期割り当てだけを追加すれば、設定画面の一覧・カスタマイズUIに自動で反映される。
// 実際の挙動(ハンドラ)は各画面がuseKeyboardShortcutsで個別に登録する。

export type ShortcutId = "togglePlay" | "deleteSelectedSegment" | "deselectSegment";

export type KeyCombo = {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

export type ShortcutDef = {
  id: ShortcutId;
  label: string;
  defaultCombo: KeyCombo;
};

function combo(key: string, modifiers: Partial<Omit<KeyCombo, "key">> = {}): KeyCombo {
  return { key, ctrl: false, shift: false, alt: false, meta: false, ...modifiers };
}

export const SHORTCUT_CATALOG: ShortcutDef[] = [
  { id: "togglePlay", label: "再生 / 一時停止", defaultCombo: combo(" ") },
  // MacのdeleteキーはBackspaceとして送られるため、こちらを初期値にする
  { id: "deleteSelectedSegment", label: "選択中の区間を削除", defaultCombo: combo("Backspace") },
  { id: "deselectSegment", label: "区間の選択を解除", defaultCombo: combo("Enter") },
];

const KEY_DISPLAY_NAMES: Record<string, string> = {
  " ": "Space",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
};

export function formatKeyCombo(target: KeyCombo): string {
  const parts: string[] = [];
  if (target.ctrl) parts.push("Ctrl");
  if (target.alt) parts.push("Alt");
  if (target.shift) parts.push("Shift");
  if (target.meta) parts.push("⌘");
  const normalizedKey = target.key.toLowerCase();
  const keyLabel =
    KEY_DISPLAY_NAMES[normalizedKey] ?? (target.key.length === 1 ? target.key.toUpperCase() : target.key);
  parts.push(keyLabel);
  return parts.join(" + ");
}

export function isSameKeyCombo(a: KeyCombo, b: KeyCombo): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt &&
    a.meta === b.meta
  );
}

export function keyComboFromEvent(e: KeyboardEvent): KeyCombo {
  return { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
}
