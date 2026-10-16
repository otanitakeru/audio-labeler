import { useState } from "react";
import { Link } from "react-router-dom";
import { useAudioFileOpener } from "../hooks/useAudioFileOpener";
import { useAudioSession } from "../hooks/useAudioSession";
import { useLabelFile } from "../hooks/useLabelFile";
import { useSpeechDetection } from "../hooks/useSpeechDetection";
import { useTranscription } from "../hooks/useTranscription";
import { useViewOptions } from "../hooks/useViewOptions";
import type { ViewOptions } from "../types";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import HeaderMenu from "./HeaderMenu";
import SegmentExportDialog from "./SegmentExportDialog";

// 「表示」メニューに並べる項目(上から順)
const VIEW_OPTION_ITEMS: { key: keyof ViewOptions; label: string }[] = [
  { key: "showSpectrogram", label: "スペクトログラム" },
  { key: "highlightUnlabeledSegments", label: "未入力の区間を色分け" },
];

type AppHeaderProps = {
  onOpenSettings: () => void;
};

function AppHeader({ onOpenSettings }: AppHeaderProps) {
  const { uploadId, isUploading } = useAudioSession();
  // 書き出していない変更の確認と読み込みのダイアログは、ホーム画面と共通でApp.tsxが出す
  const { openAudioFile } = useAudioFileOpener();
  const {
    error: labelFileError,
    canExport,
    importLabelFile,
    exportLabelFile,
    clearError: clearLabelFileError,
    isConfirmingReplace,
    confirmReplace,
    cancelReplace,
  } = useLabelFile();
  // 自動検出・文字起こし中は結果を区間に入れるため、区間を入れ替える読み込みと設定は止める。
  // 書き出し(ラベル・音声の切り出し)は区間を変えないので、文字起こしの途中までの結果でもできるようにしておく
  const { progress: detectionProgress } = useSpeechDetection();
  const { progress: transcriptionProgress } = useTranscription();
  const isProcessing = detectionProgress !== null || transcriptionProgress !== null;
  const { viewOptions, toggleViewOption } = useViewOptions();
  const [isSegmentExportOpen, setIsSegmentExportOpen] = useState(false);

  return (
    <header className="border-b border-gray-300 bg-white px-4 py-3.5">
      <div className="flex items-center gap-4">
        <Link to={uploadId ? "/edit" : "/"} className="text-lg font-semibold text-gray-900">
          Audio Labeler
        </Link>

        <HeaderMenu title="ファイル">
          {(close) => (
            <>
              <label
                className={`block px-3 py-2 text-sm ${
                  isProcessing ? "text-gray-400" : "cursor-pointer text-gray-900 hover:bg-gray-100"
                }`}
              >
                {isUploading ? "読み込み中..." : "新規音声を読み込む"}
                <input
                  type="file"
                  accept=".wav,audio/wav"
                  className="hidden"
                  disabled={isUploading || isProcessing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    close();
                    if (file) openAudioFile(file);
                    e.target.value = "";
                  }}
                />
              </label>

              <label
                className={`block px-3 py-2 text-sm ${
                  uploadId && !isProcessing ? "cursor-pointer text-gray-900 hover:bg-gray-100" : "text-gray-400"
                }`}
              >
                ラベルを読み込む
                <input
                  type="file"
                  accept=".txt,.tsv,text/plain"
                  className="hidden"
                  disabled={!uploadId || isProcessing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    close();
                    if (file) importLabelFile(file);
                    e.target.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                disabled={!canExport}
                onClick={() => {
                  close();
                  exportLabelFile();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                ラベルを書き出す
              </button>

              <button
                type="button"
                disabled={!canExport}
                onClick={() => {
                  close();
                  setIsSegmentExportOpen(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                音声を切り出す
              </button>
            </>
          )}
        </HeaderMenu>

        {/* 作業中にその場で切り替えて見比べる表示だけを置く。一度決めたらあまり変えないもの(波形の縦幅など)は設定ダイアログの「表示設定」に置く */}
        <HeaderMenu title="表示">
          {(close) =>
            VIEW_OPTION_ITEMS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={viewOptions[key]}
                onClick={() => {
                  close();
                  toggleViewOption(key);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100"
              >
                <span className="w-4 text-center">{viewOptions[key] ? "✓" : ""}</span>
                {label}
              </button>
            ))
          }
        </HeaderMenu>

        <button
          type="button"
          onClick={onOpenSettings}
          disabled={isProcessing}
          className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
        >
          設定
        </button>
      </div>

      <AlertDialog message={labelFileError} onClose={clearLabelFileError} />
      <ConfirmDialog
        open={isConfirmingReplace}
        title="ラベルを読み込む"
        message="今のラベルを読み込んだラベルで置き換えますか?"
        confirmLabel="置き換える"
        onConfirm={confirmReplace}
        onCancel={cancelReplace}
      />
      <SegmentExportDialog open={isSegmentExportOpen} onClose={() => setIsSegmentExportOpen(false)} />
    </header>
  );
}

export default AppHeader;
