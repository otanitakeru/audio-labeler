import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAudioFileOpener } from "../hooks/useAudioFileOpener";
import { useAudioSession } from "../hooks/useAudioSession";
import { useLabelFile } from "../hooks/useLabelFile";
import { useTranscription } from "../hooks/useTranscription";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";

type AppHeaderProps = {
  onOpenSettings: () => void;
};

function AppHeader({ onOpenSettings }: AppHeaderProps) {
  const { uploadId, isUploading } = useAudioSession();
  const { openAudioFile, isConfirmingDiscard, confirmDiscard, cancelDiscard } = useAudioFileOpener();
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
  // 文字起こし中は結果を区間に入れていくため、区間を入れ替える読み込みと、波形が変わる設定(チャンネルなど)は止める。
  // 書き出しは区間を変えないので、途中までの結果でもできるようにしておく
  const isTranscribing = useTranscription().progress !== null;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  return (
    <header className="border-b border-gray-300 bg-white px-4 py-3.5">
      <div className="flex items-center gap-4">
        <Link to={uploadId ? "/edit" : "/"} className="text-lg font-semibold text-gray-900">
          Audio Labeler
        </Link>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
          >
            ファイル
          </button>

          {isMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-300 bg-white py-1 shadow-md">
              <label
                className={`block px-3 py-2 text-sm ${
                  isTranscribing ? "text-gray-400" : "cursor-pointer text-gray-900 hover:bg-gray-100"
                }`}
              >
                {isUploading ? "読み込み中..." : "新規音声を読み込む"}
                <input
                  type="file"
                  accept=".wav,audio/wav"
                  className="hidden"
                  disabled={isUploading || isTranscribing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setIsMenuOpen(false);
                    if (file) openAudioFile(file);
                    e.target.value = "";
                  }}
                />
              </label>

              <label
                className={`block px-3 py-2 text-sm ${
                  uploadId && !isTranscribing ? "cursor-pointer text-gray-900 hover:bg-gray-100" : "text-gray-400"
                }`}
              >
                ラベルを読み込む
                <input
                  type="file"
                  accept=".txt,.tsv,text/plain"
                  className="hidden"
                  disabled={!uploadId || isTranscribing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setIsMenuOpen(false);
                    if (file) importLabelFile(file);
                    e.target.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                disabled={!canExport}
                onClick={() => {
                  setIsMenuOpen(false);
                  exportLabelFile();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                ラベルを書き出す
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          disabled={isTranscribing}
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
      <ConfirmDialog
        open={isConfirmingDiscard}
        title="新規音声を読み込む"
        message="書き出していないラベルは消えます。新しい音声を読み込みますか?"
        confirmLabel="読み込む"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </header>
  );
}

export default AppHeader;
