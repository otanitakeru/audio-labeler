import ConfirmDialog from "../components/ConfirmDialog";
import FilePicker from "../components/FilePicker";
import { useAudioFileOpener } from "../hooks/useAudioFileOpener";
import { useAudioSession } from "../hooks/useAudioSession";

function HomeScreen() {
  const { filename, isUploading, error } = useAudioSession();
  // ブラウザの「戻る」で編集画面から戻ってきたときは区間が残っているため、ヘッダーと同じく確認を挟む
  const { openAudioFile, isConfirmingDiscard, confirmDiscard, cancelDiscard } = useAudioFileOpener();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <FilePicker filename={filename} isUploading={isUploading} onFileSelected={openAudioFile} />
      {error && <p className="m-0 text-sm text-red-600">{error}</p>}
      <ConfirmDialog
        open={isConfirmingDiscard}
        title="新規音声を読み込む"
        message="書き出していないラベルは消えます。新しい音声を読み込みますか?"
        confirmLabel="読み込む"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
}

export default HomeScreen;
