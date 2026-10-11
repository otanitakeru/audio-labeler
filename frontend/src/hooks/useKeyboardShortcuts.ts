import { useEffect, useRef } from "react";
import { isSameKeyCombo, keyComboFromEvent, type ShortcutId } from "../shortcuts/catalog";
import { useShortcutBindings } from "./useShortcutBindings";

// falseを返したハンドラは「今は該当する操作がない」とみなし、キーのブラウザ標準動作(フォーカス中のボタンでのEnter等)を妨げない。
// 押し続けによる繰り返し(e.repeat)で挙動を変えたい操作のため、キーイベントも渡す
type ShortcutHandler = (e: KeyboardEvent) => void | boolean;
type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

// wavesurferのラベル帯のようにShadow DOM内の要素で入力している場合、document側ではe.targetが
// Shadow DOMのホスト要素に置き換わってしまうため、composedPathの先頭(実際の入力先)で判定する
function isTypingTarget(e: KeyboardEvent): boolean {
  const target = e.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

// モーダルダイアログ(設定など)の表示中は背後の画面を操作できない状態のため、キー操作も背後の画面には届けない
function isModalDialogOpen(): boolean {
  return document.querySelector("dialog:modal") !== null;
}

// 呼び出し側(各画面)が実装しているアクションのハンドラだけを渡すことで、
// その画面で有効なショートカットキーを登録する。キー割り当て自体はuseShortcutBindings側で
// カスタマイズ可能なため、ここでは常に現在の割り当てを引いて照合する。
// テキスト入力中(ラベル入力欄など)は誤発火を避けるため無視する。
// blockedの間(文字起こし中など、編集を止めているとき)は、割り当てたキーを受け取っても何もしない。
// 素通しにしないのは、⌘ + ← などがブラウザの「戻る」になり編集画面から離れてしまうため
export function useKeyboardShortcuts(handlers: ShortcutHandlers, blocked = false): void {
  const { getBinding } = useShortcutBindings();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const getBindingRef = useRef(getBinding);
  getBindingRef.current = getBinding;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || isModalDialogOpen()) return;
      const pressed = keyComboFromEvent(e);
      for (const [id, handler] of Object.entries(handlersRef.current) as [ShortcutId, ShortcutHandler | undefined][]) {
        if (!handler) continue;
        if (isSameKeyCombo(getBindingRef.current(id), pressed)) {
          if (!blockedRef.current && handler(e) === false) return;
          e.preventDefault();
          return;
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
