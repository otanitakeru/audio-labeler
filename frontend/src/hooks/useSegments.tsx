import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAudioSession } from "./useAudioSession";
import type { LabeledRange } from "../formats/labelFormat";
import type { ExistingSegmentsMode, Segment, SegmentDirection } from "../types";

type SegmentMutationResult = { success: true } | { success: false; error: string };

type SegmentsState = {
  segments: Segment[];
  // 新しい区間を追加できるかだけを検証する(エラーがあればメッセージを返す)。ラベル入力を始める前のチェックに使う
  validateNewSegment: (startSec: number, endSec: number) => string | null;
  addSegment: (startSec: number, endSec: number, label: string) => SegmentMutationResult;
  updateSegmentLabel: (id: string, label: string) => void;
  // historyGroupKeyを渡すと、直前の変更と同じキーなら履歴上1つの操作にまとめる(キーを押し続けてずらした分を1回で戻せるようにするため)
  updateSegmentRange: (id: string, startSec: number, endSec: number, historyGroupKey?: string) => SegmentMutationResult;
  removeSegment: (id: string) => void;
  // 指定の区間と、時間軸上で隣の区間を1つにする(間の無音も含める)。隣の区間がなければ何もしない
  mergeWithAdjacentSegment: (id: string, direction: SegmentDirection) => void;
  replaceSegments: (ranges: LabeledRange[]) => SegmentMutationResult;
  applyDetectedSegments: (
    ranges: Pick<Segment, "startSec" | "endSec">[],
    mode: ExistingSegmentsMode,
    source: Segment["source"],
  ) => SegmentMutationResult;
  // 区間に対する変更(追加・ラベル編集・位置変更・削除・読み込み・自動検出)を1操作ずつ取り消す/やり直す。
  // 取り消す/やり直す操作がなければfalseを返す(ショートカットとして使ったとき、キー本来の動作を妨げないため)
  undo: () => boolean;
  redo: () => boolean;
};

// 区間全体のスナップショットを操作ごとに積む。区間はたかだか数百件程度で、差分管理より単純で取りこぼしがないため
// lastGroupKeyは直前の変更が属するまとまり(historyGroupKey)。別の操作・元に戻す/やり直すで途切れる
type SegmentsHistory = { past: Segment[][]; present: Segment[]; future: Segment[][]; lastGroupKey: string | null };

// 長時間の作業でメモリを使い続けないよう、さかのぼれる操作数に上限を設ける
const MAX_HISTORY_LENGTH = 200;

const EMPTY_HISTORY: SegmentsHistory = { past: [], present: [], future: [], lastGroupKey: null };

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

// 時間軸上で隣の区間を返す。区間は追加順に並んでいるため、開始時刻順に並べ直して探す。
// 結合する相手と、キーボードで選択を移す先が食い違わないよう、「隣」の判定はここに揃える
export function findAdjacentSegment(segments: Segment[], id: string, direction: SegmentDirection): Segment | undefined {
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  const index = sorted.findIndex((s) => s.id === id);
  if (index === -1) return undefined;
  return sorted[direction === "previous" ? index - 1 : index + 1];
}

const SegmentsContext = createContext<SegmentsState | null>(null);

export function SegmentsProvider({ children }: { children: ReactNode }) {
  const { uploadId } = useAudioSession();
  const [history, setHistory] = useState<SegmentsHistory>(EMPTY_HISTORY);
  const segments = history.present;

  // 編集画面だけでなくヘッダー(ラベルの読み込み・書き出し)からも使うため、状態をルーターの外側
  // (このProvider)に置いている。そのため新しい音声ファイルが読み込まれたときだけ、
  // 前のファイルの区間(と、前のファイルに戻ってしまう履歴)が残らないよう明示的にリセットする
  useEffect(() => {
    setHistory(EMPTY_HISTORY);
  }, [uploadId]);

  // 区間を変更する操作はすべてここを通し、変更前の状態を履歴に積む(新しい操作をしたらやり直しの履歴は捨てる)。
  // 直前の変更と同じgroupKeyなら、履歴は積まずに現在の状態だけを差し替えて1つの操作にまとめる
  function commitSegments(update: (prev: Segment[]) => Segment[], groupKey?: string): void {
    setHistory((h) => {
      const continuesGroup = groupKey !== undefined && groupKey === h.lastGroupKey;
      return {
        past: continuesGroup ? h.past : [...h.past, h.present].slice(-MAX_HISTORY_LENGTH),
        present: update(h.present),
        future: [],
        lastGroupKey: groupKey ?? null,
      };
    });
  }

  function undo(): boolean {
    if (history.past.length === 0) return false;
    setHistory((h) => ({
      past: h.past.slice(0, -1),
      present: h.past[h.past.length - 1],
      future: [h.present, ...h.future],
      lastGroupKey: null,
    }));
    return true;
  }

  function redo(): boolean {
    if (history.future.length === 0) return false;
    setHistory((h) => ({
      past: [...h.past, h.present],
      present: h.future[0],
      future: h.future.slice(1),
      lastGroupKey: null,
    }));
    return true;
  }

  function validateNewSegment(startSec: number, endSec: number): string | null {
    return findRangeError(startSec, endSec, segments);
  }

  function addSegment(startSec: number, endSec: number, label: string): SegmentMutationResult {
    const error = validateNewSegment(startSec, endSec);
    if (error) return { success: false, error };
    commitSegments((prev) => [...prev, { id: crypto.randomUUID(), startSec, endSec, label, source: "manual" }]);
    return { success: true };
  }

  // 区間(startSec/endSec)は変えずラベル文言のみ更新するため、他区間との重なりは再検証不要。
  // 自動検出の候補(auto)は、人がラベルを入力した時点で確認済みとみなし確定(manual)にする(PLAN.md 5章)
  function updateSegmentLabel(id: string, label: string): void {
    commitSegments((prev) => prev.map((s) => (s.id === id ? { ...s, label, source: "manual" } : s)));
  }

  // ラベルトラック上でのドラッグによる区間の移動・リサイズを確定する。addSegmentと同じ
  // バリデーション(長さ・重なり)を通すことで、位置編集も新規追加と一貫した挙動にする。
  // ラベル入力と同様、位置を調整した候補(auto)も確定(manual)にする
  function updateSegmentRange(
    id: string,
    startSec: number,
    endSec: number,
    historyGroupKey?: string,
  ): SegmentMutationResult {
    const error = findRangeError(
      startSec,
      endSec,
      segments.filter((s) => s.id !== id),
    );
    if (error) return { success: false, error };
    commitSegments(
      (prev) => prev.map((s) => (s.id === id ? { ...s, startSec, endSec, source: "manual" } : s)),
      historyGroupKey,
    );
    return { success: true };
  }

  function removeSegment(id: string): void {
    commitSegments((prev) => prev.filter((s) => s.id !== id));
  }

  // 結合後の区間は指定の区間のIDを引き継ぐ(選択中の区間を結合したとき、選択を保ったまま続けて操作できるようにするため)。
  // 隣同士の間に他の区間はないため、2つを覆う範囲にしても重なりは起きない。
  // ラベルは時間順に半角スペースでつなぐ(空のラベルは飛ばす)。人が結合を指示した区間なので確定(manual)にする
  function mergeWithAdjacentSegment(id: string, direction: SegmentDirection): void {
    const target = segments.find((s) => s.id === id);
    const neighbor = findAdjacentSegment(segments, id, direction);
    if (!target || !neighbor) return;
    const [first, second] = direction === "previous" ? [neighbor, target] : [target, neighbor];
    const merged: Segment = {
      id,
      startSec: first.startSec,
      endSec: second.endSec,
      label: [first.label, second.label].filter((label) => label !== "").join(" "),
      source: "manual",
    };
    commitSegments((prev) => prev.filter((s) => s.id !== neighbor.id).map((s) => (s.id === id ? merged : s)));
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
    commitSegments(() => sorted.map((r) => ({ ...r, id: crypto.randomUUID(), source })));
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
    commitSegments(() => [...kept, ...accepted]);
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
        mergeWithAdjacentSegment,
        replaceSegments,
        applyDetectedSegments,
        undo,
        redo,
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
