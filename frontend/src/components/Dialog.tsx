import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

// HTML標準の<dialog>をモーダルで開く。背後の画面は操作できなくなり(inert)、Escでも閉じる
function Dialog({ open, title, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerDownOnBackdropRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Escでは<dialog>自身に閉じさせず、親のopenをfalseにしてもらう(開閉は常にopenから決まるようにする)。
      // closeイベントで同期しないのは、closeイベントは非同期に届き、閉じた直後に開き直したダイアログを遅れて届いたイベントで閉じてしまうことがあるため
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // 中身の外側(背景)を押して離したときだけ閉じる。中で押して外で離す操作(入力欄の文字選択など)では閉じないよう、押した位置も見る
      onPointerDown={(e) => {
        pointerDownOnBackdropRef.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdropRef.current && e.target === dialogRef.current) onClose();
      }}
      // 大きさは中身に合わせる(画面からはみ出す分は中身側でスクロール)
      className="m-auto max-h-[90vh] max-w-[90vw] rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-center justify-between border-b border-gray-300 px-5 py-3">
          <h2 className="m-0 text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="cursor-pointer rounded px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100"
          >
            ×
          </button>
        </div>
        {/* 閉じたときに中身の状態(キー入力の受付中など)が残らないよう、開いている間だけ描画する */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{open && children}</div>
      </div>
    </dialog>
  );
}

export default Dialog;
