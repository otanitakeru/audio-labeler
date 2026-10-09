import { useEffect, useRef } from "react";
import { isSameKeyCombo, keyComboFromEvent, type ShortcutId } from "../shortcuts/catalog";
import { useShortcutBindings } from "./useShortcutBindings";

// falseを返したハンドラは「今は該当する操作がない」とみなし、キーのブラウザ標準動作(フォーカス中のボタンでのEnter等)を妨げない
type ShortcutHandler = () => void | boolean;
type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

// wavesurferのラベル帯のようにShadow DOM内の要素で入力している場合、document側ではe.targetが
// Shadow DOMのホスト要素に置き換わってしまうため、composedPathの先頭(実際の入力先)で判定する
function isTypingTarget(e: KeyboardEvent): boolean {
  const target = e.composedPath()[0];
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
      if (isTypingTarget(e)) return;
      const pressed = keyComboFromEvent(e);
      for (const [id, handler] of Object.entries(handlersRef.current) as [ShortcutId, ShortcutHandler | undefined][]) {
        if (!handler) continue;
        if (isSameKeyCombo(getBindingRef.current(id), pressed)) {
          if (handler() === false) return;
          e.preventDefault();
          return;
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
