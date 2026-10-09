import Button from "./Button";
import Dialog from "./Dialog";

type AlertDialogProps = {
  // nullのときは閉じている
  message: string | null;
  onClose: () => void;
};

// 区間の重なりなど、ユーザー操作に起因するエラーを知らせるダイアログ
function AlertDialog({ message, onClose }: AlertDialogProps) {
  return (
    <Dialog open={message !== null} title="エラー" onClose={onClose}>
      <div className="flex w-[min(440px,80vw)] flex-col gap-6">
        <p className="m-0 text-gray-900">{message}</p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default AlertDialog;
