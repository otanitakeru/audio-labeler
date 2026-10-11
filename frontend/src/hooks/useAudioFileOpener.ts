import { useState } from "react";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";

type AudioFileOpenerState = {
  openAudioFile: (file: File) => void;
  isConfirmingDiscard: boolean;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
};

// 新しい音声を読み込むと区間はリセットされるため、書き出していない変更があれば先に確認する。
// useAudioSessionは区間の状態より外側のProviderで区間を参照できないため、確認はこのhookで挟む
export function useAudioFileOpener(): AudioFileOpenerState {
  const { uploadFile } = useAudioSession();
  const { hasUnsavedChanges } = useSegments();
  // 破棄してよいか確認している間、選ばれたファイルをここに控えておく
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const openAudioFile = (file: File) => {
    if (hasUnsavedChanges) {
      setPendingFile(file);
      return;
    }
    uploadFile(file);
  };

  const confirmDiscard = () => {
    if (pendingFile) uploadFile(pendingFile);
    setPendingFile(null);
  };

  return {
    openAudioFile,
    isConfirmingDiscard: pendingFile !== null,
    confirmDiscard,
    cancelDiscard: () => setPendingFile(null),
  };
}
