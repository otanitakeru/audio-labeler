import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  SHORTCUT_CATALOG,
  isSameKeyCombo,
  type KeyCombo,
  type ShortcutBindings,
  type ShortcutId,
} from "../shortcuts/catalog";

// 表示設定(useDisplaySettings)とは異なり、ショートカット割り当てはユーザーが手間をかけて
// カスタマイズするものなので、リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.shortcutBindings";

// 初期値から変更したものだけを保存する。後から初期値を変えたとき、変更していない割り当てにも反映されるようにするため
type BindingOverrides = Partial<Record<ShortcutId, KeyCombo>>;

function loadOverrides(): BindingOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BindingOverrides) : {};
  } catch {
    return {};
  }
}

type ShortcutBindingsState = {
  bindings: ShortcutBindings;
  getBinding: (id: ShortcutId) => KeyCombo;
  setBindings: (bindings: ShortcutBindings) => void;
};

const ShortcutBindingsContext = createContext<ShortcutBindingsState | null>(null);

export function ShortcutBindingsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<BindingOverrides>(loadOverrides);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }, [overrides]);

  const bindings = Object.fromEntries(
    SHORTCUT_CATALOG.map((def) => [def.id, overrides[def.id] ?? def.defaultCombo]),
  ) as ShortcutBindings;

  const getBinding = (id: ShortcutId): KeyCombo => bindings[id];

  const setBindings = (next: ShortcutBindings) => {
    setOverrides(
      Object.fromEntries(
        SHORTCUT_CATALOG.filter((def) => !isSameKeyCombo(next[def.id], def.defaultCombo)).map((def) => [
          def.id,
          next[def.id],
        ]),
      ),
    );
  };

  return (
    <ShortcutBindingsContext.Provider value={{ bindings, getBinding, setBindings }}>
      {children}
    </ShortcutBindingsContext.Provider>
  );
}

export function useShortcutBindings(): ShortcutBindingsState {
  const context = useContext(ShortcutBindingsContext);
  if (!context) throw new Error("useShortcutBindings must be used within a ShortcutBindingsProvider");
  return context;
}
