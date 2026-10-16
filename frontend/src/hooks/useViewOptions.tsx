import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ViewOptions } from "../types";

// ヘッダーの「表示」メニューで、作業中にその場で切り替える表示のオン/オフ。
// 一度決めたらあまり変えない表示の好み(波形の縦幅など)は、設定ダイアログ側(useDisplaySettings)で持つ。
// 切り替えた状態のまま作業を続けることが多いため、リロードしても失われないようlocalStorageへ永続化する
const STORAGE_KEY = "audio-labeler.viewOptions";

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  highlightUnlabeledSegments: false,
  showSpectrogram: false,
};

function loadViewOptions(): ViewOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 後から項目を増やしても、保存済みの設定に無い項目は初期値で補えるようにする
    return raw ? { ...DEFAULT_VIEW_OPTIONS, ...(JSON.parse(raw) as Partial<ViewOptions>) } : DEFAULT_VIEW_OPTIONS;
  } catch {
    return DEFAULT_VIEW_OPTIONS;
  }
}

type ViewOptionsState = {
  viewOptions: ViewOptions;
  toggleViewOption: (key: keyof ViewOptions) => void;
};

const ViewOptionsContext = createContext<ViewOptionsState | null>(null);

export function ViewOptionsProvider({ children }: { children: ReactNode }) {
  const [viewOptions, setViewOptions] = useState<ViewOptions>(loadViewOptions);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(viewOptions));
  }, [viewOptions]);

  const toggleViewOption = (key: keyof ViewOptions) => setViewOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <ViewOptionsContext.Provider value={{ viewOptions, toggleViewOption }}>{children}</ViewOptionsContext.Provider>
  );
}

export function useViewOptions(): ViewOptionsState {
  const context = useContext(ViewOptionsContext);
  if (!context) throw new Error("useViewOptions must be used within a ViewOptionsProvider");
  return context;
}
