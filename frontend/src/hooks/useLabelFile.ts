import { useState } from "react";
import { LabelFormatError, parseLabels, serializeLabels, type LabeledRange } from "../formats/labelFormat";
import { saveFile } from "../saveFile";
import { useAudioSession } from "./useAudioSession";
import { findLabeledRangesError, useSegments } from "./useSegments";

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

type LabelFileReadResult = { success: true; ranges: LabeledRange[] } | { success: false; error: string };

// ラベルファイルを読み、区間として入れられるかまで検証する(ヘッダーからの読み込みと、音声の読み込みのダイアログで使う)。
// 壊れたファイルで置き換えの確認を出したり、読み込みのダイアログを閉じたりしないよう、入れる前に検証を済ませる
export async function readLabelFile(file: File): Promise<LabelFileReadResult> {
  let ranges;
  try {
    ranges = parseLabels(await file.text());
  } catch (e) {
    if (!(e instanceof LabelFormatError)) throw e;
    return { success: false, error: `ラベルを読み込めませんでした。${e.message}` };
  }
  const error = findLabeledRangesError(ranges);
  if (error) return { success: false, error: `ラベルを読み込めませんでした。${error}` };
  return { success: true, ranges };
}

export function useLabelFile(): LabelFileState {
  const { filename } = useAudioSession();
  const { segments, replaceSegments, markSegmentsSaved } = useSegments();
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

  const importLabelFile = async (file: File): Promise<void> => {
    setError(null);
    const result = await readLabelFile(file);
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (segments.length > 0) {
      setPendingRanges(result.ranges);
      return;
    }
    applyRanges(result.ranges);
  };

  const confirmReplace = () => {
    if (pendingRanges) applyRanges(pendingRanges);
    setPendingRanges(null);
  };

  const exportLabelFile = async (): Promise<void> => {
    const text = serializeLabels(segments);
    const saved = await saveFile(
      `${(filename ?? "labels").replace(/\.wav$/i, "")}.txt`,
      { description: "ラベルファイル", mimeType: "text/plain", extension: ".txt" },
      async () => new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    if (saved) markSegmentsSaved();
  };

  return {
    error,
    canExport: segments.length > 0,
    importLabelFile,
    exportLabelFile,
    clearError: () => setError(null),
    isConfirmingReplace: pendingRanges !== null,
    confirmReplace,
    cancelReplace: () => setPendingRanges(null),
  };
}
