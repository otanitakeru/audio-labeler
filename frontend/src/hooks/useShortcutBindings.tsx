import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SHORTCUT_CATALOG, isSameKeyCombo, type KeyCombo, type ShortcutId } from "../shortcuts/catalog";

// 表示設定(useDisplaySettings)とは異なり、ショートカット割り当てはユーザーが手間をかけて
// カスタマイズするものなので、リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.shortcutBindings";

type BindingOverrides = Partial<Record<ShortcutId, KeyCombo>>;

function loadOverrides(): BindingOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BindingOverrides) : {};
  } catch {
    return {};
  }
}

function getDefaultCombo(id: ShortcutId): KeyCombo {
  const def = SHORTCUT_CATALOG.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown shortcut id: ${id}`);
  return def.defaultCombo;
}

type ShortcutBindingsState = {
  getBinding: (id: ShortcutId) => KeyCombo;
  setBinding: (id: ShortcutId, combo: KeyCombo) => void;
  resetBinding: (id: ShortcutId) => void;
  // 指定のキー割り当てが既に別のショートカットで使われていれば、そのIDを返す
  findConflict: (id: ShortcutId, combo: KeyCombo) => ShortcutId | null;
};

const ShortcutBindingsContext = createContext<ShortcutBindingsState | null>(null);

export function ShortcutBindingsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<BindingOverrides>(loadOverrides);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }, [overrides]);

  const getBinding = (id: ShortcutId): KeyCombo => overrides[id] ?? getDefaultCombo(id);

  const setBinding = (id: ShortcutId, combo: KeyCombo) => {
    setOverrides((prev) => ({ ...prev, [id]: combo }));
  };

  const resetBinding = (id: ShortcutId) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const findConflict = (id: ShortcutId, combo: KeyCombo): ShortcutId | null => {
    for (const def of SHORTCUT_CATALOG) {
      if (def.id === id) continue;
      if (isSameKeyCombo(overrides[def.id] ?? def.defaultCombo, combo)) return def.id;
    }
    return null;
  };

  return (
    <ShortcutBindingsContext.Provider value={{ getBinding, setBinding, resetBinding, findConflict }}>
      {children}
    </ShortcutBindingsContext.Provider>
  );
}

export function useShortcutBindings(): ShortcutBindingsState {
  const context = useContext(ShortcutBindingsContext);
  if (!context) throw new Error("useShortcutBindings must be used within a ShortcutBindingsProvider");
  return context;
}
