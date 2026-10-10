import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAudioSession } from "./useAudioSession";
import type { LabeledRange } from "../formats/labelFormat";
import type { ExistingSegmentsMode, Segment } from "../types";

type SegmentMutationResult = { success: true } | { success: false; error: string };

type SegmentsState = {
  segments: Segment[];
  // 新しい区間を追加できるかだけを検証する(エラーがあればメッセージを返す)。ラベル入力を始める前のチェックに使う
  validateNewSegment: (startSec: number, endSec: number) => string | null;
  addSegment: (startSec: number, endSec: number, label: string) => SegmentMutationResult;
  updateSegmentLabel: (id: string, label: string) => void;
  updateSegmentRange: (id: string, startSec: number, endSec: number) => SegmentMutationResult;
  removeSegment: (id: string) => void;
  replaceSegments: (ranges: LabeledRange[]) => SegmentMutationResult;
  applyDetectedSegments: (
    ranges: Pick<Segment, "startSec" | "endSec">[],
    mode: ExistingSegmentsMode,
    source: Segment["source"],
  ) => SegmentMutationResult;
};

// 新規追加・位置変更・インポートのすべてで同じ検証を通す(PLAN.md 7章: 区間の出どころによらず同じバリデーション経路)
function findRangeError(
  startSec: number,
  endSec: number,
  others: Pick<Segment, "startSec" | "endSec">[],
): string | null {
  if (startSec < 0 || endSec <= startSec) return "区間の長さが不正です";
  if (others.some((s) => startSec < s.endSec && endSec > s.startSec)) return "他の区間と重なっています";
  return null;
}

const SegmentsContext = createContext<SegmentsState | null>(null);

export function SegmentsProvider({ children }: { children: ReactNode }) {
  const { uploadId } = useAudioSession();
  const [segments, setSegments] = useState<Segment[]>([]);

  // 編集画面だけでなくヘッダー(ラベルの読み込み・書き出し)からも使うため、状態をルーターの外側
  // (このProvider)に置いている。そのため新しい音声ファイルが読み込まれたときだけ、
  // 前のファイルの区間が残らないよう明示的にリセットする
  useEffect(() => {
    setSegments([]);
  }, [uploadId]);

  function validateNewSegment(startSec: number, endSec: number): string | null {
    return findRangeError(startSec, endSec, segments);
  }

  function addSegment(startSec: number, endSec: number, label: string): SegmentMutationResult {
    const error = validateNewSegment(startSec, endSec);
    if (error) return { success: false, error };
    setSegments((prev) => [...prev, { id: crypto.randomUUID(), startSec, endSec, label, source: "manual" }]);
    return { success: true };
  }

  // 区間(startSec/endSec)は変えずラベル文言のみ更新するため、他区間との重なりは再検証不要。
  // 自動検出の候補(auto)は、人がラベルを入力した時点で確認済みとみなし確定(manual)にする(PLAN.md 5章)
  function updateSegmentLabel(id: string, label: string): void {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, label, source: "manual" } : s)));
  }

  // ラベルトラック上でのドラッグによる区間の移動・リサイズを確定する。addSegmentと同じ
  // バリデーション(長さ・重なり)を通すことで、位置編集も新規追加と一貫した挙動にする。
  // ラベル入力と同様、位置を調整した候補(auto)も確定(manual)にする
  function updateSegmentRange(id: string, startSec: number, endSec: number): SegmentMutationResult {
    const error = findRangeError(
      startSec,
      endSec,
      segments.filter((s) => s.id !== id),
    );
    if (error) return { success: false, error };
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, startSec, endSec, source: "manual" } : s)));
    return { success: true };
  }

  function removeSegment(id: string): void {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }

  // 全区間を入れ替える(ラベルファイルのインポート、自動検出のreplaceAll)。
  // 1件でも不正があれば何も変更しない(途中まで読み込まれた状態を作らないため)
  function replaceSegments(ranges: LabeledRange[], source: Segment["source"] = "manual"): SegmentMutationResult {
    const sorted = [...ranges].sort((a, b) => a.startSec - b.startSec);
    for (let i = 0; i < sorted.length; i++) {
      const { startSec, endSec } = sorted[i];
      // 開始順に並べてあり、手前の区間同士は検証済みのため、重なりうるのは直前の区間だけ
      const error = findRangeError(startSec, endSec, i > 0 ? [sorted[i - 1]] : []);
      if (error) return { success: false, error: `${startSec}〜${endSec}秒の区間: ${error}` };
    }
    setSegments(sorted.map((r) => ({ ...r, id: crypto.randomUUID(), source })));
    return { success: true };
  }

  // 自動検出の結果を反映する。ラベルは空のまま(人が確認して入力する)。
  // 通常は候補(auto)として追加するが、設定によっては最初から確定(manual)として追加する(sourceで指定)
  function applyDetectedSegments(
    ranges: Pick<Segment, "startSec" | "endSec">[],
    mode: ExistingSegmentsMode,
    source: Segment["source"],
  ): SegmentMutationResult {
    const candidates = ranges.map((r) => ({ ...r, label: "" }));
    if (mode === "replaceAll") return replaceSegments(candidates, source);

    // 人が確認した区間を優先するため、確定済みと重なる候補はエラーにせず追加しないだけにする
    const kept = segments.filter((s) => s.source === "manual");
    const accepted: Segment[] = [];
    for (const candidate of candidates) {
      if (findRangeError(candidate.startSec, candidate.endSec, [...kept, ...accepted])) continue;
      accepted.push({ ...candidate, id: crypto.randomUUID(), source });
    }
    setSegments([...kept, ...accepted]);
    return { success: true };
  }

  return (
    <SegmentsContext.Provider
      value={{
        segments,
        validateNewSegment,
        addSegment,
        updateSegmentLabel,
        updateSegmentRange,
        removeSegment,
        replaceSegments,
        applyDetectedSegments,
      }}
    >
      {children}
    </SegmentsContext.Provider>
  );
}

export function useSegments(): SegmentsState {
  const context = useContext(SegmentsContext);
  if (!context) throw new Error("useSegments must be used within a SegmentsProvider");
  return context;
}
