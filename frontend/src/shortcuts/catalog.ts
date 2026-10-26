// キーボードショートカットの定義(データ層)。
// ここにIDと表示名・グループ・初期割り当てだけを追加すれば、設定ダイアログの一覧・カスタマイズUIに自動で反映される。
// 実際の挙動(ハンドラ)は各画面がuseKeyboardShortcutsで個別に登録する。

export type ShortcutId =
  | "togglePlay"
  | "labelSelection"
  | "deleteSelectedSegment"
  | "deselectSegment"
  | "selectPreviousSegment"
  | "selectNextSegment"
  | "editSegmentLabel"
  | "undo"
  | "redo"
  | "mergeWithPreviousSegment"
  | "mergeWithNextSegment"
  | "nudgeSegmentStartLeft"
  | "nudgeSegmentStartRight"
  | "nudgeSegmentEndLeft"
  | "nudgeSegmentEndRight"
  | "detectSpeechInSelectedSegment"
  | "chooseDetectionPresetForSelectedSegment";

export type KeyCombo = {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

// 設定ダイアログでショートカットをまとめて表示する単位。配列の順に表示する
export const SHORTCUT_GROUPS = ["基本操作", "ラベル", "区間の調整"] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export type ShortcutDef = {
  id: ShortcutId;
  label: string;
  group: ShortcutGroup;
  defaultCombo: KeyCombo;
};

function combo(key: string, modifiers: Partial<Omit<KeyCombo, "key">> = {}): KeyCombo {
  return { key, ctrl: false, shift: false, alt: false, meta: false, ...modifiers };
}

// OS標準のショートカット(コピー等)と同じ感覚で使えるよう、修飾キーはMacなら⌘、それ以外(Windows等)ならCtrlにする
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
const PRIMARY_MODIFIER: Partial<Omit<KeyCombo, "key">> = IS_MAC ? { meta: true } : { ctrl: true };

export const SHORTCUT_CATALOG: ShortcutDef[] = [
  { id: "togglePlay", label: "再生 / 一時停止", group: "基本操作", defaultCombo: combo(" ") },
  {
    id: "labelSelection",
    label: "選択範囲にラベルを追加",
    group: "ラベル",
    defaultCombo: combo("b", PRIMARY_MODIFIER),
  },
  // MacのdeleteキーはBackspaceとして送られるため、こちらを初期値にする
  { id: "deleteSelectedSegment", label: "選択中の区間を削除", group: "ラベル", defaultCombo: combo("Backspace") },
  { id: "deselectSegment", label: "区間の選択を解除", group: "ラベル", defaultCombo: combo("Escape") },
  { id: "selectPreviousSegment", label: "前の区間を選択", group: "ラベル", defaultCombo: combo("ArrowLeft") },
  { id: "selectNextSegment", label: "次の区間を選択", group: "ラベル", defaultCombo: combo("ArrowRight") },
  // 編集中のEnterは文言の確定になるため、Enterで編集の開始・確定を切り替えられる
  { id: "editSegmentLabel", label: "選択中の区間の文言を編集", group: "ラベル", defaultCombo: combo("Enter") },
  { id: "undo", label: "元に戻す", group: "ラベル", defaultCombo: combo("z", PRIMARY_MODIFIER) },
  // やり直しはOSごとの慣習に合わせる(Macは⌘ + Shift + Z、Windows等はCtrl + Y)
  {
    id: "redo",
    label: "やり直す",
    group: "ラベル",
    defaultCombo: IS_MAC ? combo("z", { meta: true, shift: true }) : combo("y", { ctrl: true }),
  },
  // Alt + ←はWindowsのブラウザでは「戻る」だが、このショートカットは結合する相手がなくてもキーを素通ししないため使える
  {
    id: "mergeWithPreviousSegment",
    label: "前の区間と結合",
    group: "区間の調整",
    defaultCombo: combo("ArrowLeft", { alt: true }),
  },
  {
    id: "mergeWithNextSegment",
    label: "次の区間と結合",
    group: "区間の調整",
    defaultCombo: combo("ArrowRight", { alt: true }),
  },
  // ⌘ + ←/→ はMacのブラウザでは「戻る/進む」だが、このショートカットは選択中の区間がなくてもキーを素通ししないため使える
  {
    id: "nudgeSegmentStartLeft",
    label: "開始を左へずらす",
    group: "区間の調整",
    defaultCombo: combo("ArrowLeft", { ...PRIMARY_MODIFIER, shift: true }),
  },
  {
    id: "nudgeSegmentStartRight",
    label: "開始を右へずらす",
    group: "区間の調整",
    defaultCombo: combo("ArrowRight", { ...PRIMARY_MODIFIER, shift: true }),
  },
  {
    id: "nudgeSegmentEndLeft",
    label: "終了を左へずらす",
    group: "区間の調整",
    defaultCombo: combo("ArrowLeft", PRIMARY_MODIFIER),
  },
  {
    id: "nudgeSegmentEndRight",
    label: "終了を右へずらす",
    group: "区間の調整",
    defaultCombo: combo("ArrowRight", PRIMARY_MODIFIER),
  },
  // ⌘ + D / Ctrl + D はブラウザでは「ブックマークに追加」だが、このショートカットは選択中の区間がなくてもキーを素通ししないため使える
  {
    id: "detectSpeechInSelectedSegment",
    label: "選択中の区間を自動検出",
    group: "区間の調整",
    defaultCombo: combo("d", PRIMARY_MODIFIER),
  },
  // ⌘ + Shift + D / Ctrl + Shift + D はブラウザでは「すべてのタブをブックマークに追加」だが、上と同じくキーを素通ししないため使える
  {
    id: "chooseDetectionPresetForSelectedSegment",
    label: "プリセットを選んで自動検出",
    group: "区間の調整",
    defaultCombo: combo("d", { ...PRIMARY_MODIFIER, shift: true }),
  },
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
  // MacではAltキーはOption(⌥)のため、⌘と同じく記号で表示する
  if (target.alt) parts.push(IS_MAC ? "⌥" : "Alt");
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

// 全ショートカットの現在の割り当て。設定ダイアログではOKを押すまでこの形の下書きを編集する
export type ShortcutBindings = Record<ShortcutId, KeyCombo>;

export function findConflict(bindings: ShortcutBindings, id: ShortcutId, target: KeyCombo): ShortcutId | null {
  for (const def of SHORTCUT_CATALOG) {
    if (def.id !== id && isSameKeyCombo(bindings[def.id], target)) return def.id;
  }
  return null;
}

export function keyComboFromEvent(e: KeyboardEvent): KeyCombo {
  return { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
}
