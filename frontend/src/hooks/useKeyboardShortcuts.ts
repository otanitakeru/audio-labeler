import { useEffect, useRef } from "react";
import { isSameKeyCombo, keyComboFromEvent, type ShortcutId } from "../shortcuts/catalog";
import { useShortcutBindings } from "./useShortcutBindings";

type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

// 呼び出し側(各画面)が実装しているアクションのハンドラだけを渡すことで、
// その画面で有効なショートカットキーを登録する。キー割り当て自体はuseShortcutBindings側で
// カスタマイズ可能なため、ここでは常に現在の割り当てを引いて照合する。
// テキスト入力中(ラベル入力欄など)は誤発火を避けるため無視する。
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const { getBinding } = useShortcutBindings();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const getBindingRef = useRef(getBinding);
  getBindingRef.current = getBinding;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const pressed = keyComboFromEvent(e);
      for (const [id, handler] of Object.entries(handlersRef.current) as [ShortcutId, (() => void) | undefined][]) {
        if (!handler) continue;
        if (isSameKeyCombo(getBindingRef.current(id), pressed)) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
