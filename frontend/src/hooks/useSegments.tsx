import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAudioSession } from "./useAudioSession";
import type { Segment } from "../types";

type SegmentMutationResult = { success: true } | { success: false; error: string };

type SegmentsState = {
  segments: Segment[];
  addSegment: (startSec: number, endSec: number, label: string) => SegmentMutationResult;
  updateSegmentLabel: (id: string, label: string) => void;
  updateSegmentRange: (id: string, startSec: number, endSec: number) => SegmentMutationResult;
  removeSegment: (id: string) => void;
};

const SegmentsContext = createContext<SegmentsState | null>(null);

export function SegmentsProvider({ children }: { children: ReactNode }) {
  const { uploadId } = useAudioSession();
  const [segments, setSegments] = useState<Segment[]>([]);

  // 画面遷移(編集画面⇔設定画面)をまたいでも区間を保持できるよう、状態をルーターの外側
  // (このProvider)に置いている。そのため新しい音声ファイルが読み込まれたときだけ、
  // 前のファイルの区間が残らないよう明示的にリセットする
  useEffect(() => {
    setSegments([]);
  }, [uploadId]);

  // ignoreIdは、既存区間自身の位置を変更する際にその区間自身との重なり判定を除外するために使う
  function overlapsExisting(startSec: number, endSec: number, ignoreId?: string): boolean {
    return segments.some((s) => s.id !== ignoreId && startSec < s.endSec && endSec > s.startSec);
  }

  function addSegment(startSec: number, endSec: number, label: string): SegmentMutationResult {
    if (endSec <= startSec) {
      return { success: false, error: "区間の長さが不正です" };
    }
    if (overlapsExisting(startSec, endSec)) {
      return { success: false, error: "既存の区間と重なっています" };
    }
    setSegments((prev) => [...prev, { id: crypto.randomUUID(), startSec, endSec, label, source: "manual" }]);
    return { success: true };
  }

  // 区間(startSec/endSec)は変えずラベル文言のみ更新するため、他区間との重なりは再検証不要
  function updateSegmentLabel(id: string, label: string): void {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  // ラベルトラック上でのドラッグによる区間の移動・リサイズを確定する。addSegmentと同じ
  // バリデーション(長さ・重なり)を通すことで、位置編集も新規追加と一貫した挙動にする
  function updateSegmentRange(id: string, startSec: number, endSec: number): SegmentMutationResult {
    if (endSec <= startSec) {
      return { success: false, error: "区間の長さが不正です" };
    }
    if (overlapsExisting(startSec, endSec, id)) {
      return { success: false, error: "既存の区間と重なっています" };
    }
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, startSec, endSec } : s)));
    return { success: true };
  }

  function removeSegment(id: string): void {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <SegmentsContext.Provider value={{ segments, addSegment, updateSegmentLabel, updateSegmentRange, removeSegment }}>
      {children}
    </SegmentsContext.Provider>
  );
}

export function useSegments(): SegmentsState {
  const context = useContext(SegmentsContext);
  if (!context) throw new Error("useSegments must be used within a SegmentsProvider");
  return context;
}
