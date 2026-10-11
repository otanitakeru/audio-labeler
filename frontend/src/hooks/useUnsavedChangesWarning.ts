import { useEffect } from "react";
import { useSegments } from "./useSegments";

// 書き出していない区間があるときに、リロード・タブを閉じる操作で確認を出す。
// ページを離れる操作はブラウザが止めるため、ConfirmDialogではなくブラウザ標準の確認になる(文言は変えられない)
export function useUnsavedChangesWarning(): void {
  const { hasUnsavedChanges } = useSegments();

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
