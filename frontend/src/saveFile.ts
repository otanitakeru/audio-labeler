// showSaveFilePickerはChrome/Edgeのみが対応しており、TypeScript標準の型定義に含まれないため使う範囲だけ宣言する
declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
}

type SavedFileType = {
  // 保存ダイアログのファイルの種類に出す名前
  description: string;
  mimeType: string;
  extension: string;
};

// 保存場所を選べるChrome/Edgeでは保存ダイアログを出し、それ以外のブラウザではダウンロードフォルダに保存する
// (ラベルの書き出しと音声の切り出しで使う)。保存したらtrue、保存ダイアログでキャンセルされたらfalseを返す。
// 中身は保存場所を選んだ後に作る。showSaveFilePickerはクリックの直後でないと拒否されるため、
// 中身の用意(バックエンドでのZIPの作成など)に時間がかかる場合も先に保存ダイアログを出す必要がある
export async function saveFile(
  suggestedName: string,
  fileType: SavedFileType,
  createContent: () => Promise<Blob>,
): Promise<boolean> {
  if (window.showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: fileType.description, accept: { [fileType.mimeType]: [fileType.extension] } }],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      throw e;
    }
    const content = await createContent();
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  }

  const url = URL.createObjectURL(await createContent());
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
