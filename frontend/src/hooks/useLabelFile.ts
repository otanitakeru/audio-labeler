import { useState } from "react";
import { LabelFormatError, parseLabels, serializeLabels, type LabeledRange } from "../formats/labelFormat";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";
import { useVadSettings } from "./useVadSettings";

type LabelFileState = {
  error: string | null;
  canExport: boolean;
  importLabelFile: (file: File) => Promise<void>;
  exportLabelFile: () => Promise<void>;
  clearError: () => void;
  isConfirmingReplace: boolean;
  confirmReplace: () => void;
  cancelReplace: () => void;
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
  const { segments, replaceSegments, markSegmentsSaved } = useSegments();
  const { vadSettings } = useVadSettings();
  const exportableSegments = vadSettings.exportCandidates ? segments : segments.filter((s) => s.source === "manual");
  const [error, setError] = useState<string | null>(null);
  // 既存のラベルを置き換えてよいか確認している間、読み込んだ区間をここに控えておく
  const [pendingRanges, setPendingRanges] = useState<LabeledRange[] | null>(null);

  const applyRanges = (ranges: LabeledRange[]) => {
    const result = replaceSegments(ranges);
    if (!result.success) {
      setError(`ラベルを読み込めませんでした。${result.error}`);
      return;
    }
    markSegmentsSaved();
  };

  // 壊れたファイルで置き換えの確認を出さないよう、形式の検証を先に行ってから確認する
  const importLabelFile = async (file: File): Promise<void> => {
    setError(null);

    let ranges;
    try {
      ranges = parseLabels(await file.text());
    } catch (e) {
      if (!(e instanceof LabelFormatError)) throw e;
      setError(`ラベルを読み込めませんでした。${e.message}`);
      return;
    }

    if (segments.length > 0) {
      setPendingRanges(ranges);
      return;
    }
    applyRanges(ranges);
  };

  const confirmReplace = () => {
    if (pendingRanges) applyRanges(pendingRanges);
    setPendingRanges(null);
  };

  // 保存場所を選べるChrome/Edgeでは保存ダイアログを出し、それ以外のブラウザではダウンロードフォルダに保存する
  const exportLabelFile = async (): Promise<void> => {
    const text = serializeLabels(exportableSegments);
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
      markSegmentsSaved();
      return;
    }

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(url);
    markSegmentsSaved();
  };

  return {
    error,
    canExport: exportableSegments.length > 0,
    importLabelFile,
    exportLabelFile,
    clearError: () => setError(null),
    isConfirmingReplace: pendingRanges !== null,
    confirmReplace,
    cancelReplace: () => setPendingRanges(null),
  };
}
