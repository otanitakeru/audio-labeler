type FilePickerProps = {
  filename: string | null;
  isUploading: boolean;
  onFileSelected: (file: File) => void;
};

function FilePicker({ filename, isUploading, onFileSelected }: FilePickerProps) {
  return (
    <label
      className={`inline-flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 bg-white px-10 py-8 text-xl font-medium text-gray-900 ${
        isUploading ? "opacity-60" : "cursor-pointer hover:bg-gray-100"
      }`}
    >
      {isUploading && (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
      )}
      {isUploading ? "読み込み中..." : (filename ?? "音声ファイルを選択")}
      <input
        type="file"
        accept=".wav,audio/wav"
        className="hidden"
        disabled={isUploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export default FilePicker;
