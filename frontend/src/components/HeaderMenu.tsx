import { useEffect, useRef, useState, type ReactNode } from "react";

type HeaderMenuProps = {
  title: string;
  // 項目を選んだらメニューを閉じられるよう、閉じる関数を渡して中身を描く
  children: (close: () => void) => ReactNode;
};

// ヘッダーのドロップダウンメニュー(「ファイル」「表示」)。外側を押したら閉じる
function HeaderMenu({ title, children }: HeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
      >
        {title}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-300 bg-white py-1 shadow-md">
          {children(() => setIsOpen(false))}
        </div>
      )}
    </div>
  );
}

export default HeaderMenu;
