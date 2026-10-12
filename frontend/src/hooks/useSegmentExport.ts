import { useState } from "react";
import { SegmentExportRequestError, exportSegmentAudio } from "../api/segmentExportApi";
import { nameRanges, serializeSegmentList, serializeTextList } from "../formats/segmentExportFormat";
import { saveFile } from "../saveFile";
import type { Segment, SegmentExportChoices } from "../types";
import { useAudioSession } from "./useAudioSession";
import { useSegments } from "./useSegments";

export function selectExportedSegments(segments: Segment[], labeledOnly: boolean): Segment[] {
  return labeledOnly ? segments.filter((s) => s.label !== "") : segments;
}

// 区間ごとに切り出した音声を、segment.txt・text.txt と一緒にZIPで保存する(PLAN.md 5章)。
// 切り出しのダイアログだけが使うため、Contextで共有はしない
export function useSegmentExport(): {
  isExporting: boolean;
  error: string | null;
  // 保存したらtrue、保存ダイアログでキャンセルされたり失敗したりしたらfalseを返す
  exportSegments: (choices: SegmentExportChoices) => Promise<boolean>;
} {
  const { audioInfo, channel: loadedChannel } = useAudioSession();
  const { segments } = useSegments();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportSegments = async (choices: SegmentExportChoices): Promise<boolean> => {
    if (!audioInfo) return false;
    setError(null);
    const ranges = nameRanges(selectExportedSegments(segments, choices.labeledOnly), choices.zeroPadIds);
    const textFiles: Record<string, string> = { "segment.txt": serializeSegmentList(ranges, choices.delimiter) };
    if (choices.includeLabels) textFiles["text.txt"] = serializeTextList(ranges, choices.delimiter);
    const folderName = audioInfo.filename.replace(/\.wav$/i, "");

    try {
      return await saveFile(
        `${folderName}_segments.zip`,
        { description: "ZIPファイル", mimeType: "application/zip", extension: ".zip" },
        async () => {
          // 保存場所を選んでから切り出す(saveFile参照)。切り出しには数秒かかることがあるので、その間だけ書き出し中にする
          setIsExporting(true);
          return exportSegmentAudio(audioInfo.uploadId, {
            folderName,
            channel: choices.channel === "loaded" ? loadedChannel : choices.channel === "all" ? null : choices.channel,
            sampleRate: choices.sampleRate,
            sampleFormat: choices.sampleFormat,
            ranges,
            textFiles,
          });
        },
      );
    } catch (e) {
      setError(
        e instanceof SegmentExportRequestError
          ? e.message
          : "音声を切り出せませんでした。音声を読み込み直してから、もう一度お試しください。",
      );
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  return { isExporting, error, exportSegments };
}
