import Button from "./Button";
import Dialog from "./Dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// window.confirm()の代わりに使う確認ダイアログ。Esc・×・背景クリックで閉じたときはキャンセル扱いにする
function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className="flex w-[min(440px,80vw)] flex-col gap-6">
        <p className="m-0 text-gray-900">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default ConfirmDialog;
