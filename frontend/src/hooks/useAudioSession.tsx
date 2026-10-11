import { createContext, useContext, useState, type ReactNode } from "react";
import { uploadAudioFile } from "../api/audioApi";
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
  // アップロード済みの音声を、指定したチャンネルで表示中の音声にする
  loadAudio: (info: AudioFileInfo, channel: number) => void;
};

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
    } catch {
      setError("音声ファイルを読み込めませんでした。WAV形式のファイルを選択してください。");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const loadAudio = (info: AudioFileInfo, nextChannel: number) => {
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
