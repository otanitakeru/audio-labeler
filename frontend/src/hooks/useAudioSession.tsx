import { createContext, useContext, useState, type ReactNode } from "react";
import { AudioUploadRequestError, deleteUploadedAudio, uploadAudioFile } from "../api/audioApi";
import type { AudioFileInfo } from "../types";

type AudioSessionState = {
  // 読み込んだ音声ファイルの情報(元ファイルのサンプリングレート・ビット深度など)。未読み込みならnull
  audioInfo: AudioFileInfo | null;
  uploadId: string | null;
  filename: string | null;
  // 波形に表示しているチャンネル。読み込みのダイアログで選び、読み込んだ後は変えない(PLAN.md 4章-1)
  channel: number;
  isUploading: boolean;
  error: string | null;
  clearError: () => void;
  // バックエンドへアップロードし、ファイルの情報を返す(失敗したらnull)。読み込みのダイアログでチャンネル数などを見てから
  // 読み込むかを決めるため、ここでは表示中の音声を切り替えない
  uploadFile: (file: File) => Promise<AudioFileInfo | null>;
  // アップロード済みの音声を、指定したチャンネルで表示中の音声にする。それまで表示していた音声はバックエンドから消す
  loadAudio: (info: AudioFileInfo, channel: number) => void;
  // アップロードしたが読み込まなかった(読み込みのダイアログでキャンセルした)音声を、バックエンドから消す
  discardUpload: (info: AudioFileInfo) => void;
};

// 使わなくなった音声をバックエンドから消す(PLAN.md 4章-1)。失敗しても利用者にできることはなく、
// 残った分はバックエンドの再起動で消えるため知らせない
function deleteUnusedUpload(uploadId: string): void {
  deleteUploadedAudio(uploadId).catch(() => {});
}

const AudioSessionContext = createContext<AudioSessionState | null>(null);

export function AudioSessionProvider({ children }: { children: ReactNode }) {
  const [audioInfo, setAudioInfo] = useState<AudioFileInfo | null>(null);
  const [channel, setChannel] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File): Promise<AudioFileInfo | null> => {
    setIsUploading(true);
    setError(null);
    try {
      return await uploadAudioFile(file);
    } catch (e) {
      // ファイルに原因があるときはバックエンドが400で理由を返すため、それ以外はサーバー側(停止中など)の問題として知らせる
      setError(
        e instanceof AudioUploadRequestError
          ? e.message
          : "音声ファイルを読み込めませんでした。サーバーが起動しているか確認して、もう一度お試しください。",
      );
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // 1ファイル完結で前の音声に戻ることはないため、切り替えたら前の音声は消す。自動検出・文字起こし・切り出しの間は
  // 音声を切り替えられないため、前の音声を使っている処理はない
  const loadAudio = (info: AudioFileInfo, nextChannel: number) => {
    if (audioInfo && audioInfo.uploadId !== info.uploadId) deleteUnusedUpload(audioInfo.uploadId);
    setAudioInfo(info);
    setChannel(nextChannel);
  };

  return (
    <AudioSessionContext.Provider
      value={{
        audioInfo,
        uploadId: audioInfo?.uploadId ?? null,
        filename: audioInfo?.filename ?? null,
        channel,
        isUploading,
        error,
        clearError: () => setError(null),
        uploadFile,
        loadAudio,
        discardUpload: (info) => deleteUnusedUpload(info.uploadId),
      }}
    >
      {children}
    </AudioSessionContext.Provider>
  );
}

export function useAudioSession(): AudioSessionState {
  const context = useContext(AudioSessionContext);
  if (!context) throw new Error("useAudioSession must be used within an AudioSessionProvider");
  return context;
}
