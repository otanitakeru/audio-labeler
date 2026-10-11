import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAudioSession } from "./useAudioSession";
import { sanitizeLabel, type LabeledRange } from "../formats/labelFormat";
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
  ) => SegmentMutationResult;
  // 文字起こしの結果をラベルとして入れる。
  // 1回の実行では同じhistoryGroupKeyを渡し、届いた順に入れた結果を履歴上1つの操作にまとめる
  applyTranscribedLabel: (id: string, label: string, historyGroupKey: string) => void;
  // 区間に対する変更(追加・ラベル編集・位置変更・削除・読み込み・自動検出・文字起こし)を1操作ずつ取り消す/やり直す。
  // 取り消す/やり直す操作がなければfalseを返す(ショートカットとして使ったとき、キー本来の動作を妨げないため)
  undo: () => boolean;
  redo: () => boolean;
  // 最後に書き出した(または読み込んだ)ときから区間が変わっているか。リロード・タブを閉じるときの確認に使う
  hasUnsavedChanges: boolean;
  // 現在の区間をファイルと一致した状態として記録する。ラベルの書き出し・読み込みの後に呼ぶ
  markSegmentsSaved: () => void;
};

// 区間全体のスナップショットを操作ごとに積む。区間はたかだか数百件程度で、差分管理より単純で取りこぼしがないため
// lastGroupKeyは直前の変更が属するまとまり(historyGroupKey)。別の操作・元に戻す/やり直すで途切れる。
// savedはファイルと一致している時点のスナップショット。参照で比較するため、元に戻すで書き出し時点に戻れば未保存ではなくなる
type SegmentsHistory = {
  past: Segment[][];
  present: Segment[];
  future: Segment[][];
  lastGroupKey: string | null;
  saved: Segment[];
};

// 長時間の作業でメモリを使い続けないよう、さかのぼれる操作数に上限を設ける
const MAX_HISTORY_LENGTH = 200;

const NO_SEGMENTS: Segment[] = [];
const EMPTY_HISTORY: SegmentsHistory = {
  past: [],
  present: NO_SEGMENTS,
  future: [],
  lastGroupKey: null,
  saved: NO_SEGMENTS,
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
  // 直前の変更と同じgroupKeyなら、履歴は積まずに現在の状態だけを差し替えて1つの操作にまとめる。
  // updateが同じ配列を返したら何も変わっていないとみなし、履歴に積まない(空振りの操作で元に戻す回数や未保存の判定が狂わないように)
  function commitSegments(update: (prev: Segment[]) => Segment[], groupKey?: string): void {
    setHistory((h) => {
      const next = update(h.present);
      if (next === h.present) return h;
      const continuesGroup = groupKey !== undefined && groupKey === h.lastGroupKey;
      return {
        ...h,
        past: continuesGroup ? h.past : [...h.past, h.present].slice(-MAX_HISTORY_LENGTH),
        present: next,
        future: [],
        lastGroupKey: groupKey ?? null,
      };
    });
  }

  function undo(): boolean {
    if (history.past.length === 0) return false;
    setHistory((h) => ({
      ...h,
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
      ...h,
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
    commitSegments((prev) => [...prev, { id: crypto.randomUUID(), startSec, endSec, label }]);
    return { success: true };
  }

  // 区間(startSec/endSec)は変えずラベル文言のみ更新するため、他区間との重なりは再検証不要
  function updateSegmentLabel(id: string, label: string): void {
    commitSegments((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  // ラベルトラック上でのドラッグによる区間の移動・リサイズを確定する。addSegmentと同じ
  // バリデーション(長さ・重なり)を通すことで、位置編集も新規追加と一貫した挙動にする
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
    commitSegments((prev) => prev.map((s) => (s.id === id ? { ...s, startSec, endSec } : s)), historyGroupKey);
    return { success: true };
  }

  function removeSegment(id: string): void {
    commitSegments((prev) => prev.filter((s) => s.id !== id));
  }

  // 結合後の区間は指定の区間のIDを引き継ぐ(選択中の区間を結合したとき、選択を保ったまま続けて操作できるようにするため)。
  // 隣同士の間に他の区間はないため、2つを覆う範囲にしても重なりは起きない。
  // ラベルは時間順に半角スペースでつなぐ(空のラベルは飛ばす)
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
    };
    commitSegments((prev) => prev.filter((s) => s.id !== neighbor.id).map((s) => (s.id === id ? merged : s)));
  }

  // 全区間を入れ替える(ラベルファイルのインポート、自動検出のreplaceAll)。
  // 1件でも不正があれば何も変更しない(途中まで読み込まれた状態を作らないため)
  function replaceSegments(ranges: LabeledRange[]): SegmentMutationResult {
    const sorted = [...ranges].sort((a, b) => a.startSec - b.startSec);
    for (let i = 0; i < sorted.length; i++) {
      const { startSec, endSec } = sorted[i];
      // 開始順に並べてあり、手前の区間同士は検証済みのため、重なりうるのは直前の区間だけ
      const error = findRangeError(startSec, endSec, i > 0 ? [sorted[i - 1]] : []);
      if (error) return { success: false, error: `${startSec}〜${endSec}秒の区間: ${error}` };
    }
    commitSegments(() => sorted.map((r) => ({ ...r, id: crypto.randomUUID() })));
    return { success: true };
  }

  // 自動検出の結果を反映する。ラベルは空のまま(人が確認して入力するか、文字起こしで埋める)
  function applyDetectedSegments(
    ranges: Pick<Segment, "startSec" | "endSec">[],
    mode: ExistingSegmentsMode,
  ): SegmentMutationResult {
    const detected = ranges.map((r) => ({ ...r, label: "" }));
    if (mode === "replaceAll") return replaceSegments(detected);

    // 人が作った・直した区間を優先するため、既にある区間と重なる検出結果はエラーにせず足さないだけにする。
    // 自動検出中は区間の編集を止めているため、実行を始めた時点の区間と比べてよい
    const accepted: Segment[] = [];
    for (const range of detected) {
      if (findRangeError(range.startSec, range.endSec, [...segments, ...accepted])) continue;
      accepted.push({ ...range, id: crypto.randomUUID() });
    }
    // 検出し直したときは前回の結果と重なって何も足されないため、黙って終わらず理由を知らせる
    if (accepted.length === 0) {
      return {
        success: false,
        error:
          "既にある区間と重ならない区間は見つかりませんでした。検出し直すときは、設定の「既にある区間」を「すべて置き換える」にしてください。",
      };
    }
    commitSegments((prev) => [...prev, ...accepted]);
    return { success: true };
  }

  // 結果は届いた順に1件ずつ入れるが、同じhistoryGroupKeyでまとめるため、1回の実行分を元に戻す1回で戻せる。
  // 文字起こし中は区間の編集を止めているため、実行を始めた時点の区間にそのまま入れてよい
  function applyTranscribedLabel(id: string, label: string, historyGroupKey: string): void {
    const sanitized = sanitizeLabel(label);
    // 文言が変わらないときは元の配列を返して履歴に積まない(まとまりも切らない)
    commitSegments((prev) => {
      const current = prev.find((s) => s.id === id);
      if (!current || current.label === sanitized) return prev;
      return prev.map((s) => (s.id === id ? { ...s, label: sanitized } : s));
    }, historyGroupKey);
  }

  // 直前に積まれた変更(読み込み直後の置き換えなど)の後の状態を記録するため、関数形式で更新する
  function markSegmentsSaved(): void {
    setHistory((h) => ({ ...h, saved: h.present }));
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
        applyTranscribedLabel,
        undo,
        redo,
        hasUnsavedChanges: history.present !== history.saved,
        markSegmentsSaved,
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
