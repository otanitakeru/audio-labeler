import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAudioSession } from "../hooks/useAudioSession";

function AppHeader() {
  const { uploadId, isUploading, uploadFile } = useAudioSession();
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
              <label className="block cursor-pointer px-3 py-2 text-sm text-gray-900 hover:bg-gray-100">
                {isUploading ? "読み込み中..." : "新規音声を読み込む"}
                <input
                  type="file"
                  accept=".wav,audio/wav"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setIsMenuOpen(false);
                    if (file) uploadFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <Link to="/settings" className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100">
          設定
        </Link>
      </div>
    </header>
  );
}

export default AppHeader;
