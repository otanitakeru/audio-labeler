import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchBackendFeatures } from "../api/featuresApi";
import type { BackendFeatures } from "../types";

// 答えが返るまでは使えないものとして扱う。使えないボタンを出すより、少し遅れて出る方が安全なため(PLAN.md 6章)
const NO_FEATURES: BackendFeatures = { speechDetection: false, transcription: false };
// バックエンドがまだ起動していないときに、起動を待って問い合わせ直す間隔
const RETRY_INTERVAL_MS = 3000;

const BackendFeaturesContext = createContext<BackendFeatures | null>(null);

// 使える機能はバックエンドのビルドで決まり、起動している間は変わらないため、答えが返ったら問い合わせ直さない
export function BackendFeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<BackendFeatures>(NO_FEATURES);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetchBackendFeatures()
        .then((result) => {
          if (!cancelled) setFeatures(result);
        })
        .catch(() => {
          if (!cancelled) retryTimer = setTimeout(load, RETRY_INTERVAL_MS);
        });
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  return <BackendFeaturesContext.Provider value={features}>{children}</BackendFeaturesContext.Provider>;
}

export function useBackendFeatures(): BackendFeatures {
  const context = useContext(BackendFeaturesContext);
  if (!context) throw new Error("useBackendFeatures must be used within a BackendFeaturesProvider");
  return context;
}
