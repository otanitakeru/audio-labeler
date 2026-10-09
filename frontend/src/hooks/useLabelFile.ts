import { useState } from "react";
import { LabelFormatError, parseLabels, serializeLabels } from "../formats/labelFormat";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";

type LabelFileState = {
  error: string | null;
  canExport: boolean;
  importLabelFile: (file: File) => Promise<void>;
  exportLabelFile: () => Promise<void>;
  clearError: () => void;
};

// showSaveFilePickerはChrome/Edgeのみが対応しており、TypeScript標準の型定義に含まれないため使う範囲だけ宣言する
declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
}

export function useLabelFile(): LabelFileState {
  const { filename } = useAudioSession();
  const { segments, replaceSegments } = useSegments();
  const [error, setError] = useState<string | null>(null);

  const importLabelFile = async (file: File): Promise<void> => {
    setError(null);
    if (segments.length > 0 && !window.confirm("今のラベルを読み込んだラベルで置き換えますか?")) return;

    let ranges;
    try {
      ranges = parseLabels(await file.text());
    } catch (e) {
      if (!(e instanceof LabelFormatError)) throw e;
      setError(`ラベルを読み込めませんでした。${e.message}`);
      return;
    }

    const result = replaceSegments(ranges);
    if (!result.success) setError(`ラベルを読み込めませんでした。${result.error}`);
  };

  // 保存場所を選べるChrome/Edgeでは保存ダイアログを出し、それ以外のブラウザではダウンロードフォルダに保存する
  const exportLabelFile = async (): Promise<void> => {
    const text = serializeLabels(segments);
    const suggestedName = `${(filename ?? "labels").replace(/\.wav$/i, "")}.txt`;

    if (window.showSaveFilePicker) {
      let handle: FileSystemFileHandle;
      try {
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: "ラベルファイル", accept: { "text/plain": [".txt"] } }],
        });
      } catch (e) {
        // 保存ダイアログでキャンセルされたときは何もしない
        if (e instanceof DOMException && e.name === "AbortError") return;
        throw e;
      }
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    error,
    canExport: segments.length > 0,
    importLabelFile,
    exportLabelFile,
    clearError: () => setError(null),
  };
}
