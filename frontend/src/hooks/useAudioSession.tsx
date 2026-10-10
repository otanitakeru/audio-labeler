import { createContext, useContext, useState, type ReactNode } from "react";
import { uploadAudioFile } from "../api/audioApi";
import type { AudioFileInfo } from "../types";

type AudioSessionState = {
  // 読み込んだ音声ファイルの情報(元ファイルのサンプリングレート・ビット深度など)。未読み込みならnull
  audioInfo: AudioFileInfo | null;
  uploadId: string | null;
  filename: string | null;
  channelCount: number;
  channel: number;
  // チャンネル番号は音声を読み込む前から設定できるため、読み込んだ音声に存在しない番号になっていることがある
  channelOutOfRange: boolean;
  isUploading: boolean;
  // アップロード中のファイル名。アップロードが終わるまでuploadId/filenameは前の音声のままなので、
  // 画面上で「何を読み込んでいるか」をすぐ示すために使う
  uploadingFilename: string | null;
  error: string | null;
  clearError: () => void;
  uploadFile: (file: File) => Promise<boolean>;
  setChannel: (channel: number) => void;
};

const AudioSessionContext = createContext<AudioSessionState | null>(null);

export function AudioSessionProvider({ children }: { children: ReactNode }) {
  const [audioInfo, setAudioInfo] = useState<AudioFileInfo | null>(null);
  const [channel, setChannel] = useState(0);
  const [uploadingFilename, setUploadingFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUploading = uploadingFilename !== null;

  const uploadFile = async (file: File): Promise<boolean> => {
    setUploadingFilename(file.name);
    setError(null);
    try {
      setAudioInfo(await uploadAudioFile(file));
      return true;
    } catch {
      setError("音声ファイルを読み込めませんでした。WAV形式のファイルを選択してください。");
      return false;
    } finally {
      setUploadingFilename(null);
    }
  };

  const uploadId = audioInfo?.uploadId ?? null;
  const filename = audioInfo?.filename ?? null;
  const channelCount = audioInfo?.channelCount ?? 1;
  const channelOutOfRange = uploadId !== null && (channel < 0 || channel >= channelCount);

  return (
    <AudioSessionContext.Provider
      value={{
        audioInfo,
        uploadId,
        filename,
        channelCount,
        channel,
        channelOutOfRange,
        isUploading,
        uploadingFilename,
        error,
        clearError: () => setError(null),
        uploadFile,
        setChannel,
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
