import { createContext, useContext, useState, type ReactNode } from "react";
import { uploadAudioFile } from "../api/audioApi";

type AudioSessionState = {
  uploadId: string | null;
  filename: string | null;
  channelCount: number;
  channel: number;
  // チャンネル番号は音声を読み込む前から設定できるため、読み込んだ音声に存在しない番号になっていることがある
  channelOutOfRange: boolean;
  isUploading: boolean;
  error: string | null;
  uploadFile: (file: File) => Promise<boolean>;
  setChannel: (channel: number) => void;
};

const AudioSessionContext = createContext<AudioSessionState | null>(null);

export function AudioSessionProvider({ children }: { children: ReactNode }) {
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState(1);
  const [channel, setChannel] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File): Promise<boolean> => {
    setIsUploading(true);
    setError(null);
    try {
      const info = await uploadAudioFile(file);
      setUploadId(info.uploadId);
      setFilename(info.filename);
      setChannelCount(info.channelCount);
      return true;
    } catch {
      setError("音声ファイルを読み込めませんでした。WAV形式のファイルを選択してください。");
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const channelOutOfRange = uploadId !== null && (channel < 0 || channel >= channelCount);

  return (
    <AudioSessionContext.Provider
      value={{
        uploadId,
        filename,
        channelCount,
        channel,
        channelOutOfRange,
        isUploading,
        error,
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
