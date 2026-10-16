import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Minimap from "wavesurfer.js/plugins/minimap";
import RegionsPlugin, { type Region } from "wavesurfer.js/plugins/regions";
import { findAdjacentSegment } from "./useSegments";
import { sanitizeLabel } from "../formats/labelFormat";
import type { SpectrogramData } from "../spectrogram/computeSpectrogram";
import { getMaxDisplayFrequency } from "../spectrogram/frequencyScale";
import { requestSpectrogram } from "../spectrogram/requestSpectrogram";
import { createSpectrogramView } from "../spectrogram/spectrogramView";
import { createTimeAxisView, TIME_AXIS_HEIGHT_PX, type TimeAxisView } from "../timeAxisView";
import type { PlaybackScrollMode, Segment, SegmentDirection, SpectrogramColorMap } from "../types";

// メイン波形を拡大表示する際の1秒あたりの初期ピクセル数(全体はMinimapで確認する)
const DEFAULT_ZOOM = 100;
// Cmd/Ctrl+スクロールでの拡大率(1秒あたりのピクセル数)の可動域。UIにスライダーは出さず、
// ホイール操作でのみ変更する(スライダーだとホイールとの二重の入力経路になるため設けない)
const MIN_ZOOM = 20;
// 上限は、25分の音声で波形全体の幅がブラウザの扱える大きさ(Firefoxで約1800万px)に収まるようにする(PLAN.md 5章)
const MAX_ZOOM = 5000;
// 縦方向の拡大率(wavesurferのbarHeight)。1が基準(振幅ピークが枠いっぱい)で、
// 大きいほど小さな振幅が見やすくなる代わりに大きな振幅は枠からはみ出す
const DEFAULT_VERTICAL_ZOOM = 0.9;
const MIN_VERTICAL_ZOOM = 0.9;
const MAX_VERTICAL_ZOOM = 10;
// Cmd/Ctrl+スクロール1ステップあたりのズーム倍率
const WHEEL_ZOOM_FACTOR = 1.1;
// リサイズ/ドラッグ選択時に区間の長さが0にならないようにする下限(秒)
const MIN_REGION_LENGTH_SEC = 0.01;
// キーボードで区間を選択して表示位置を動かすとき、区間の手前に空けておく余白(表示幅に対する割合)
const SCROLL_MARGIN_RATIO = 0.1;
// キーで区間の開始/終了をずらすとき、押し続けた時間(ms)に応じて1回あたりの移動量にかける倍率(時間の昇順)。
// 押した回数ではなく時間で決めるのは、OSのキーリピートの速さが環境によって違うため
const NUDGE_ACCELERATION_STAGES = [
  { afterMs: 0, multiplier: 1 },
  { afterMs: 500, multiplier: 2 },
  { afterMs: 1500, multiplier: 5 },
  { afterMs: 3000, multiplier: 10 },
];
// 加速しても1回あたりの移動量はこれを超えない(設定値が大きいと行き過ぎるため)
const MAX_ACCELERATED_NUDGE_STEP_MS = 100;

const SELECTION_REGION_COLOR = "rgba(234, 88, 12, 0.15)";
type SegmentColors = {
  region: string;
  activeRegion: string;
  labelBackground: string;
  labelBorder: string;
  // 全体波形上に重ねる色。全体波形は縦幅が小さく薄い色だと見えにくいため、メイン波形より濃くする
  minimap: string;
};
const SEGMENT_COLORS: SegmentColors = {
  region: "rgba(37, 99, 235, 0.12)",
  activeRegion: "rgba(37, 99, 235, 0.25)",
  labelBackground: "rgba(239, 246, 255, 0.95)",
  labelBorder: "#2563eb",
  minimap: "rgba(37, 99, 235, 0.3)",
};
// 編集を止めている間(自動検出・文字起こし中)の配色。押しても操作できないことが分かるよう灰色にする
const LOCKED_SEGMENT_COLORS: SegmentColors = {
  region: "rgba(107, 114, 128, 0.12)",
  activeRegion: "rgba(107, 114, 128, 0.25)",
  labelBackground: "rgba(243, 244, 246, 0.95)",
  labelBorder: "#6b7280",
  minimap: "rgba(107, 114, 128, 0.35)",
};
// 自動検出・文字起こしで処理した分の配色。普段の青・編集を止めている間の灰色のどちらとも見分けられるよう緑にする。
// 文字起こしで処理し終わった区間と、自動検出の途中経過(発話らしさがしきい値を超えた部分)に使う
const PROCESSED_SEGMENT_COLORS: SegmentColors = {
  region: "rgba(22, 163, 74, 0.25)",
  activeRegion: "rgba(22, 163, 74, 0.25)",
  labelBackground: "rgba(240, 253, 244, 0.95)",
  labelBorder: "#16a34a",
  minimap: "rgba(22, 163, 74, 0.45)",
};
// 文字起こしで今処理している区間の配色。処理し終わった区間(緑)と見分けられるよう、同じ緑でより濃くする
const HIGHLIGHTED_SEGMENT_COLORS: SegmentColors = {
  region: "rgba(22, 163, 74, 0.45)",
  activeRegion: "rgba(22, 163, 74, 0.45)",
  labelBackground: "rgba(220, 252, 231, 0.95)",
  labelBorder: "#15803d",
  minimap: "rgba(22, 163, 74, 0.7)",
};
// ヘッダーの「表示」で色分けをオンにしたときの、ラベルが空の区間の配色。普段の青・実行中の灰色・処理済みの緑・
// 選択範囲のオレンジのどれとも見分けられるよう赤系にする。調整帯の配色はUNLABELED_ADJUST_TRACK_COLORなど
const UNLABELED_SEGMENT_COLORS: SegmentColors = {
  region: "rgba(225, 29, 72, 0.12)",
  activeRegion: "rgba(225, 29, 72, 0.25)",
  labelBackground: "rgba(255, 241, 242, 0.95)",
  labelBorder: "#e11d48",
  minimap: "rgba(225, 29, 72, 0.35)",
};
// スペクトログラムの上に重ねる、アクティブな区間の色(アクティブでない区間は塗らない)。普段の青はRoseus・Viridisの
// 暗い側に埋もれて見えないため、色の表ごとに、表に含まれない色相(Roseusは黒〜紫〜橙〜白なので水色、
// Viridisは紫〜緑〜黄なのでピンク)を使う
const SPECTROGRAM_ACTIVE_SEGMENT_COLORS: Record<SpectrogramColorMap, string> = {
  gray: SEGMENT_COLORS.activeRegion,
  roseus: "rgba(34, 211, 238, 0.3)",
  viridis: "rgba(244, 114, 182, 0.3)",
};

// 文字起こしで処理中の区間の塗りを、処理し終わった区間の緑と濃い緑の間でなめらかに行き来させる(速さは実行中の枠の色の
// 変化(index.cssのborder-pulse)と揃える)。区間はwavesurferのShadow DOMの中にありページのCSSが届かないため、要素に直接かける
function pulseHighlightedBackground(el: HTMLElement, highlighted: string, processed: string): Animation {
  return el.animate([{ backgroundColor: processed }, { backgroundColor: highlighted }], {
    duration: 1000,
    iterations: Infinity,
    direction: "alternate",
    easing: "ease-in-out",
  });
}

// 時間の範囲を、親要素(波形全体の幅を持つ要素)に対する割合で置いた帯を作る
function createRangeBar(
  range: Pick<Segment, "startSec" | "endSec">,
  duration: number,
  background: string,
): HTMLDivElement {
  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:absolute",
    "top:0",
    "bottom:0",
    `left:${(range.startSec / duration) * 100}%`,
    `width:${((range.endSec - range.startSec) / duration) * 100}%`,
    `background:${background}`,
  ].join(";");
  return bar;
}

// 編集を止めている間は、処理中の区間(highlightedSegmentId)を濃い緑、処理し終わった区間を緑、他を灰色にする。
// どこまで処理したかを波形上で追えるようにするため。未入力の区間の色分けより、こちらの進み具合を優先する
function getSegmentColors(
  segment: Segment,
  editingLocked: boolean,
  highlightedSegmentId: string | null,
  processedSegmentIds: ReadonlySet<string>,
  highlightUnlabeled: boolean,
): SegmentColors {
  if (!editingLocked) return highlightUnlabeled && segment.label === "" ? UNLABELED_SEGMENT_COLORS : SEGMENT_COLORS;
  if (segment.id === highlightedSegmentId) return HIGHLIGHTED_SEGMENT_COLORS;
  return processedSegmentIds.has(segment.id) ? PROCESSED_SEGMENT_COLORS : LOCKED_SEGMENT_COLORS;
}

type RegionFill = {
  setColors: (colors: SegmentColors, isActive: boolean) => void;
  // 高さ・色の表を変えたら、続けてsetColorsを呼んで塗り直す
  setSpectrogram: (height: number, colorMap: SpectrogramColorMap) => void;
  // 文字起こしで処理中の区間の塗りを動かす帯(スペクトログラムの部分は動かさない)
  statusBands: HTMLElement[];
};

// 区間の塗り。波形とラベル領域には区間の状態に応じた色(未入力の赤・実行中の灰色や緑)を塗り、スペクトログラムの部分は
// アクティブな区間だけを、状態によらず色の表に合わせた色で塗る(色の濃淡を読み取る邪魔にならないようにするため。
// PLAN.md 5章)。区間(Region)の要素の背景色では高さ方向に塗り分けられないため、要素の背景は透明にして帯を重ねる。
// メイン波形とスペクトログラムの間の時間の目盛りの帯は、目盛りを読めるよう塗らない
function createRegionFill(
  element: HTMLElement,
  mainWaveformHeight: number,
  spectrogramHeight: number,
  spectrogramColorMap: SpectrogramColorMap,
): RegionFill {
  const createBand = () => {
    const band = document.createElement("div");
    band.style.cssText = "position:absolute;left:0;right:0;pointer-events:none";
    // ラベル帯・調整帯より奥に置く
    element.prepend(band);
    return band;
  };
  const waveformBand = createBand();
  const spectrogramBand = createBand();
  const labelAreaBand = createBand();
  waveformBand.style.top = "0";
  waveformBand.style.height = `${mainWaveformHeight}px`;
  const spectrogramTop = mainWaveformHeight + TIME_AXIS_HEIGHT_PX;
  spectrogramBand.style.top = `${spectrogramTop}px`;
  labelAreaBand.style.bottom = "0";
  let spectrogramActiveColor = SPECTROGRAM_ACTIVE_SEGMENT_COLORS[spectrogramColorMap];
  const setSpectrogram = (height: number, colorMap: SpectrogramColorMap) => {
    spectrogramBand.style.height = `${height}px`;
    labelAreaBand.style.top = `${spectrogramTop + height}px`;
    spectrogramActiveColor = SPECTROGRAM_ACTIVE_SEGMENT_COLORS[colorMap];
  };
  setSpectrogram(spectrogramHeight, spectrogramColorMap);

  return {
    setColors: (colors, isActive) => {
      const color = isActive ? colors.activeRegion : colors.region;
      waveformBand.style.backgroundColor = color;
      labelAreaBand.style.backgroundColor = color;
      spectrogramBand.style.backgroundColor = isActive ? spectrogramActiveColor : "transparent";
    },
    setSpectrogram,
    statusBands: [waveformBand, labelAreaBand],
  };
}

// ラベル文言を表示・編集する帯の高さ(px)。「波形の下側にラベルを書く」という見た目にするため、
// 区間(Region)自体は波形+ラベル領域の全高を使いつつ、テキストはこの帯にだけ配置する
const LABEL_BAR_HEIGHT_PX = 40;
// ラベル帯のさらに下に置く、区間の位置・幅を調整する帯の高さ(px)と、その両端にある幅調整つまみの幅(px)
const ADJUST_BAR_HEIGHT_PX = 14;
const ADJUST_HANDLE_WIDTH_PX = 10;
// 波形の下に確保するラベル領域(ラベル帯+調整帯)の高さ
const LABEL_AREA_HEIGHT_PX = LABEL_BAR_HEIGHT_PX + ADJUST_BAR_HEIGHT_PX;

// Cmd/Ctrl+スクロール1ステップぶん、現在値をズーム倍率で拡大縮小する(min〜maxにクランプ)。
// 横方向(zoom)・縦方向(verticalZoom)のどちらのホイールズームでも同じ計算を使う
function applyWheelZoomStep(prev: number, deltaY: number, min: number, max: number): number {
  const next = deltaY < 0 ? prev * WHEEL_ZOOM_FACTOR : prev / WHEEL_ZOOM_FACTOR;
  return Math.min(max, Math.max(min, next));
}

// 再生中の表示位置の動かし方を、wavesurferのautoScroll/autoCenterに対応づける
function getPlaybackScrollOptions(mode: PlaybackScrollMode): { autoScroll: boolean; autoCenter: boolean } {
  return { autoScroll: mode !== "none", autoCenter: mode === "center" };
}

// 小数の足し引き(例: 1.23 - 0.01 = 1.2199999999999998)で生じる誤差だけを取り除く。
// 1ナノ秒の桁はサンプリング周期よりはるかに細かく、意味のある桁を切り詰めることにはならない(PLAN.md 3章)
function roundFloatingError(sec: number): number {
  return Number(sec.toFixed(9));
}

// 区間が表示範囲に収まっていなければ、区間の先頭が左端の少し内側に来るよう表示位置を動かす
function scrollSegmentIntoView(wavesurfer: WaveSurfer, segment: Segment): void {
  const pxPerSec = wavesurfer.getWrapper().clientWidth / wavesurfer.getDuration();
  const viewStartSec = wavesurfer.getScroll() / pxPerSec;
  const viewWidthSec = wavesurfer.getWidth() / pxPerSec;
  if (segment.startSec >= viewStartSec && segment.endSec <= viewStartSec + viewWidthSec) return;
  wavesurfer.setScrollTime(Math.max(0, segment.startSec - viewWidthSec * SCROLL_MARGIN_RATIO));
}

function getPeakAmplitude(audioBuffer: AudioBuffer | null): number {
  if (!audioBuffer) return 0;
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  return peak;
}

// contentEditable要素にフォーカスし、キャレットを末尾に置く
function focusAtEnd(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

// 日本語入力の変換中か。変換を確定するEnterでラベルの入力まで確定しないよう、キー操作の前に確かめる。
// Safariは変換を確定した後にkeydownを送り、isComposingがfalseになるため、変換中のキーを表すkeyCode(229)も見る
function isImeComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

// 区間(Region)の下端に固定表示する、ラベル文言表示・編集用の要素を作る。
// ここでは見た目(波形下端に固定する位置・配色)だけを用意し、編集可否(contentEditable)は呼び出し側で決める
function createLabelContent(initialText: string, background: string, borderColor: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = initialText;
  el.style.cssText = [
    "position:absolute",
    "left:0",
    "right:0",
    `bottom:${ADJUST_BAR_HEIGHT_PX}px`,
    `height:${LABEL_BAR_HEIGHT_PX}px`,
    "display:flex",
    "align-items:center",
    "padding:0 4px",
    "font-size:14px",
    "line-height:1",
    "color:#111827",
    "white-space:nowrap",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "outline:none",
    "cursor:text",
    "box-sizing:border-box",
  ].join(";");
  setLabelContentColors(el, background, borderColor);
  el.addEventListener("focus", () => {
    // 自動検出・文字起こしの開始・終了で色が変わるため、作成時ではなくその時点の枠線色を使う
    el.style.outline = `2px solid ${el.style.borderTopColor}`;
    el.style.outlineOffset = "-2px";
  });
  el.addEventListener("blur", () => {
    el.style.outline = "none";
  });
  return el;
}

function setLabelContentColors(el: HTMLElement, background: string, borderColor: string): void {
  el.style.background = background;
  el.style.borderTop = `1px solid ${borderColor}`;
}

type AdjustMode = "move" | "start" | "end";

type AdjustBarHandlers = {
  // 押した時点で呼ばれる。非選択の区間でも、調整帯を押せばそのまま選択してドラッグを始められるようにするため
  onStart: () => void;
  // deltaPxはドラッグ開始位置からの累積移動量。逐次の差分を積み上げると、端でのクランプ時に位置がずれていくため
  onMove: (mode: AdjustMode, deltaPx: number) => void;
  onEnd: () => void;
};

type AdjustBar = {
  element: HTMLDivElement;
  setActive: (active: boolean) => void;
  // 編集を止めている間(自動検出・文字起こし中)は、操作できないことが分かるよう区間と同じ灰色にし、
  // カーソルを当てても掴める・幅を変えられる形に変えない
  setLocked: (locked: boolean) => void;
  // 未入力の区間の色分けがオンでラベルが空のときは、区間と同じ赤系にする。編集を止めている間の灰色が優先
  setUnlabeled: (unlabeled: boolean) => void;
};

// 調整帯の配色。非選択時も「掴める」ことが分かる程度に見せ、選択中・ホバー中は濃くする。
// lockedは編集を止めている間の配色で、ホバーしても変えない
const ADJUST_TRACK_COLOR = {
  idle: "rgba(37, 99, 235, 0.12)",
  hover: "rgba(37, 99, 235, 0.22)",
  active: "rgba(37, 99, 235, 0.3)",
  locked: "rgba(107, 114, 128, 0.12)",
};
const ADJUST_KNOB_COLOR = { idle: "#93c5fd", hover: "#60a5fa", active: "#2563eb", locked: "#d1d5db" };
// 未入力の区間の調整帯の配色(UNLABELED_SEGMENT_COLORSと同じ赤系で、濃さの段階は上の青と揃える)
const UNLABELED_ADJUST_TRACK_COLOR = {
  ...ADJUST_TRACK_COLOR,
  idle: "rgba(225, 29, 72, 0.12)",
  hover: "rgba(225, 29, 72, 0.22)",
  active: "rgba(225, 29, 72, 0.3)",
};
const UNLABELED_ADJUST_KNOB_COLOR = { ...ADJUST_KNOB_COLOR, idle: "#fda4af", hover: "#fb7185", active: "#e11d48" };

// ラベル帯の下に置く、区間の位置・幅を調整する帯。中央(グリップ)のドラッグで移動、両端のつまみのドラッグで幅を変える。
// 波形部分やラベル帯でのドラッグ(新規のドラッグ選択・文字選択)と操作を混同しないよう、位置・幅はここでしか変えられない
function createAdjustBar({ onStart, onMove, onEnd }: AdjustBarHandlers): AdjustBar {
  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:absolute",
    "left:0",
    "right:0",
    "bottom:2px",
    `height:${ADJUST_BAR_HEIGHT_PX - 4}px`,
    "border-radius:3px",
    "cursor:grab",
    "touch-action:none",
    "transition:background-color 0.1s",
  ].join(";");

  // 移動できることを示す中央のグリップ(点3つ)
  const grip = document.createElement("div");
  grip.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "width:14px",
    "height:4px",
    "transform:translate(-50%, -50%)",
    "pointer-events:none",
  ].join(";");
  bar.appendChild(grip);

  // 幅を変えられることを示す両端のつまみ(縦線2本入り)
  const createKnob = (side: "left" | "right") => {
    const knob = document.createElement("div");
    knob.style.cssText = [
      "position:absolute",
      "top:-2px",
      "bottom:-2px",
      `${side}:0`,
      `width:${ADJUST_HANDLE_WIDTH_PX}px`,
      "border-radius:2px",
      "cursor:ew-resize",
      "background-image:linear-gradient(to right, transparent 3px, rgba(255,255,255,0.9) 3px, rgba(255,255,255,0.9) 4px, transparent 4px, transparent 6px, rgba(255,255,255,0.9) 6px, rgba(255,255,255,0.9) 7px, transparent 7px)",
      "background-size:100% 6px",
      "background-position:center",
      "background-repeat:no-repeat",
      "transition:background-color 0.1s",
    ].join(";");
    bar.appendChild(knob);
    return knob;
  };
  const startKnob = createKnob("left");
  const endKnob = createKnob("right");

  let isActive = false;
  let isHovered = false;
  let isLocked = false;
  let isUnlabeled = false;
  const render = () => {
    const state = isLocked ? "locked" : isActive ? "active" : isHovered ? "hover" : "idle";
    const trackColor = (isUnlabeled ? UNLABELED_ADJUST_TRACK_COLOR : ADJUST_TRACK_COLOR)[state];
    const knobColor = (isUnlabeled ? UNLABELED_ADJUST_KNOB_COLOR : ADJUST_KNOB_COLOR)[state];
    bar.style.backgroundColor = trackColor;
    startKnob.style.backgroundColor = knobColor;
    endKnob.style.backgroundColor = knobColor;
    grip.style.backgroundImage = `radial-gradient(circle, ${knobColor} 1.5px, transparent 1.5px)`;
    grip.style.backgroundSize = "5px 4px";
    bar.style.cursor = isLocked ? "default" : "grab";
    startKnob.style.cursor = isLocked ? "default" : "ew-resize";
    endKnob.style.cursor = isLocked ? "default" : "ew-resize";
  };
  render();
  bar.addEventListener("pointerenter", () => {
    isHovered = true;
    render();
  });
  bar.addEventListener("pointerleave", () => {
    isHovered = false;
    render();
  });

  // 波形側のドラッグ選択・クリックでのシークが始まらないよう伝播を止める
  bar.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const mode: AdjustMode = e.target === startKnob ? "start" : e.target === endKnob ? "end" : "move";
    const originX = e.clientX;
    bar.setPointerCapture(e.pointerId);
    bar.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
    onStart();

    const handleMove = (ev: PointerEvent) => onMove(mode, ev.clientX - originX);
    const handleUp = () => {
      bar.removeEventListener("pointermove", handleMove);
      bar.removeEventListener("pointerup", handleUp);
      bar.removeEventListener("pointercancel", handleUp);
      bar.style.cursor = "grab";
      onEnd();
    };
    bar.addEventListener("pointermove", handleMove);
    bar.addEventListener("pointerup", handleUp);
    bar.addEventListener("pointercancel", handleUp);
  });
  bar.addEventListener("click", (e) => e.stopPropagation());

  return {
    element: bar,
    setActive: (active) => {
      isActive = active;
      render();
    },
    setLocked: (locked) => {
      if (isLocked === locked) return;
      isLocked = locked;
      render();
    },
    setUnlabeled: (unlabeled) => {
      if (isUnlabeled === unlabeled) return;
      isUnlabeled = unlabeled;
      render();
    },
  };
}

// MinimapプラグインはメインのwavesurferのShadow DOM内に全体波形を差し込むため、part属性で探す
function getMinimapElement(wavesurfer: WaveSurfer): HTMLElement | null {
  const root = wavesurfer.getWrapper().getRootNode();
  return root instanceof ShadowRoot ? root.querySelector<HTMLElement>('[part="minimap"]') : null;
}

// 全体波形を、メイン波形の表示位置を動かすためのスクロール操作に使う。
// ドラッグで表示範囲(ハイライト)を動かし、ホイールで横にスクロールする。戻り値はリスナーの解除関数
function attachMinimapScroll(minimap: HTMLElement, wavesurfer: WaveSurfer): () => void {
  // メイン波形の表示範囲を、全体の幅に対する比率(0〜1)で扱う
  const getTotalWidth = () => wavesurfer.getWrapper().clientWidth || 1;
  const toRatio = (clientX: number) => {
    const rect = minimap.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  };
  minimap.style.cursor = "grab";

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const viewStart = wavesurfer.getScroll() / getTotalWidth();
    const viewWidth = wavesurfer.getWidth() / getTotalWidth();
    const pressed = toRatio(e.clientX);
    // ハイライトの内側を掴んだときは掴んだ位置を保ったまま動かし、外側を押したときはその位置が中心に来るよう表示する
    const grabOffset = pressed >= viewStart && pressed <= viewStart + viewWidth ? pressed - viewStart : viewWidth / 2;
    const scrollTo = (clientX: number) => wavesurfer.setScroll((toRatio(clientX) - grabOffset) * getTotalWidth());

    minimap.setPointerCapture(e.pointerId);
    minimap.style.cursor = "grabbing";
    scrollTo(e.clientX);
    const handleMove = (ev: PointerEvent) => scrollTo(ev.clientX);
    const handleUp = () => {
      minimap.removeEventListener("pointermove", handleMove);
      minimap.removeEventListener("pointerup", handleUp);
      minimap.removeEventListener("pointercancel", handleUp);
      minimap.style.cursor = "grab";
    };
    minimap.addEventListener("pointermove", handleMove);
    minimap.addEventListener("pointerup", handleUp);
    minimap.addEventListener("pointercancel", handleUp);
  };

  // Cmd/Ctrl+スクロールは横方向のズームとして波形コンテナ側で扱うため、ここでは素のスクロールだけを拾う
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    wavesurfer.setScroll(wavesurfer.getScroll() + e.deltaX + e.deltaY);
  };

  minimap.addEventListener("pointerdown", onPointerDown);
  minimap.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    minimap.removeEventListener("pointerdown", onPointerDown);
    minimap.removeEventListener("wheel", onWheel);
  };
}

type UseWavesurferOptions = {
  segments: Segment[];
  // ラベル入力を始める前に、選択範囲に区間を追加できるか検証する。エラーがあればメッセージを返す
  validateNewSegment: (startSec: number, endSec: number) => string | null;
  // 選択範囲へのラベル入力が確定したときに呼ばれる。エラーがあればメッセージを返す
  onAddSegment: (startSec: number, endSec: number, label: string) => string | null;
  onUpdateLabel: (id: string, label: string) => void;
  // 調整帯での移動/幅変更が確定したときに呼ばれる。エラーがあればメッセージを返す(呼び出し側で元の位置に戻す)
  // historyGroupKeyが直前の変更と同じなら、履歴上1つの操作にまとめられる
  onUpdateRange: (id: string, startSec: number, endSec: number, historyGroupKey?: string) => string | null;
  onDeleteSegment: (id: string) => void;
  onMergeSegment: (id: string, direction: SegmentDirection) => void;
  // 重なりなど、ユーザー操作に起因するエラーをまとめて通知する
  onError: (message: string) => void;
  mainWaveformHeight: number;
  minimapHeight: number;
  // メイン波形とラベル帯の間に出すスペクトログラムの縦幅。0なら出さない
  spectrogramHeight: number;
  spectrogramColorMap: SpectrogramColorMap;
  // スペクトログラムの分析の窓の長さ(ミリ秒)。変えると計算し直す
  spectrogramWindowMs: number;
  // 元の音声のサンプリング周波数。表示用にデコードするサンプリング周波数を決めるのに使う
  sourceSampleRate: number | null;
  playbackScrollMode: PlaybackScrollMode;
  // 再生の速さ(1が等速)。音の高さは変えない
  playbackRate: number;
  // 再生の音量(1が元の音量)。1より大きいと増幅する
  volume: number;
  // ショートカットで区間の開始・終了を1回ずらす量(ミリ秒)。ドラッグでは合わせにくい細かい調整に使う
  segmentNudgeStepMs: number;
  // 縦の目盛り(AmplitudeAxis)上でのCmd/Ctrl+スクロールをverticalZoomに反映するための参照
  amplitudeAxisRef: React.RefObject<HTMLDivElement | null>;
  // trueの間(自動検出・文字起こし中)は、波形・ラベル領域での選択・編集・シークを止める。表示位置の移動(ホイール・全体波形)はできる
  editingLocked: boolean;
  // editingLockedの間、濃い緑で目立たせる区間(文字起こしで処理中の区間)
  highlightedSegmentId: string | null;
  // editingLockedの間、緑にする区間(文字起こしで処理し終わった区間)
  processedSegmentIds: ReadonlySet<string>;
  // 自動検出の途中経過(発話らしさがしきい値を超えた部分)。区間とは別に、波形の上に塗るだけで操作はできない
  detectionPreviewRanges: Pick<Segment, "startSec" | "endSec">[];
  // ラベルが空の区間を別の色にする(ヘッダーの「表示」メニューで切り替える)
  highlightUnlabeledSegments: boolean;
  // 時間の目盛りの位置に縦の補助線を引く(ヘッダーの「表示」メニューで切り替える)
  showGridLines: boolean;
};

type UseWavesurferResult = {
  isReady: boolean;
  // 音声の取得・デコードに失敗した(バックエンドの再起動でアップロードした音声が消えたときなど)
  isLoadFailed: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  // 縦軸の目盛りに表示すべき絶対振幅値(0〜1)。normalize:trueとverticalZoomの効果を反映した、
  // 現在枠いっぱいに描画されている振幅の絶対値
  visiblePeakAmplitude: number;
  // スペクトログラムの上端の周波数(Hz)。20kHzか、サンプリング周波数の半分の低い方
  spectrogramMaxFrequency: number;
  // スペクトログラムを計算している間(表示したのに、まだ描けていない間)
  isSpectrogramComputing: boolean;
  togglePlay: () => void;
  // 選択中の区間。なければnull
  getSelectedSegment: () => Segment | null;
  // 選択中の区間がなければfalseを返す(ショートカットとして使ったとき、キー本来の動作を妨げないため)
  deleteSelectedSegment: () => boolean;
  deselectSegment: () => boolean;
  // 選択中の区間の前/次の区間を選択する。何も選択していなければ再生位置を基準にする。該当する区間がなければfalse
  selectAdjacentSegment: (direction: SegmentDirection) => boolean;
  // 選択中の区間の文言編集を始める(ラベル帯のダブルクリックと同じ)
  editSelectedSegmentLabel: () => boolean;
  mergeSelectedSegment: (direction: SegmentDirection) => void;
  // 選択中の区間の開始または終了を、決まった量だけ左右にずらす。isRepeatはキーの押し続けによる繰り返しか
  nudgeSelectedSegment: (edge: "start" | "end", direction: "left" | "right", isRepeat: boolean) => void;
  // 選択範囲(ドラッグ選択)に対してラベル入力を始める。選択範囲がない・入力中ならfalse。
  // 他の区間と重なるなど追加できない範囲なら、入力は始めずonErrorで知らせる
  startLabelingSelection: () => boolean;
};

export function useWavesurfer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  audioUrl: string | null,
  {
    segments,
    validateNewSegment,
    onAddSegment,
    onUpdateLabel,
    onUpdateRange,
    onDeleteSegment,
    onMergeSegment,
    onError,
    mainWaveformHeight,
    minimapHeight,
    spectrogramHeight,
    spectrogramColorMap,
    spectrogramWindowMs,
    sourceSampleRate,
    playbackScrollMode,
    playbackRate,
    volume,
    segmentNudgeStepMs,
    amplitudeAxisRef,
    editingLocked,
    highlightedSegmentId,
    processedSegmentIds,
    detectionPreviewRanges,
    highlightUnlabeledSegments,
    showGridLines,
  }: UseWavesurferOptions,
): UseWavesurferResult {
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  // 再生の音を通して音量を変えるノード。ブラウザ標準の音量(media.volume)は100%が上限で増幅できないため
  const gainNodeRef = useRef<GainNode | null>(null);
  // 波形上のドラッグ選択で作られる選択範囲。確定済み区間とは別物で、同時に1つだけ。
  // ラベル入力(startLabelingSelection)や、将来の範囲再生の対象になるため、ラベル入力とは独立した状態として持つ
  const selectionRegionRef = useRef<Region | null>(null);
  // 選択範囲にラベル入力中なら、その入力を取り消す(選択範囲自体は残す)関数と、入力欄の要素
  const labelingRef = useRef<{ cancel: () => void; content: HTMLElement } | null>(null);
  const minimapElementRef = useRef<HTMLElement | null>(null);
  // 全体波形の上に確定済み区間の範囲を表示するレイヤー
  const minimapSegmentLayerRef = useRef<HTMLDivElement | null>(null);
  // メイン波形の上に自動検出の途中経過を表示するレイヤー
  const detectionPreviewLayerRef = useRef<HTMLDivElement | null>(null);
  // 全体波形とメイン波形の間の時間の目盛りと、縦の補助線
  const timeAxisViewRef = useRef<TimeAxisView | null>(null);
  // イベントハンドラは初期化effect内で一度だけ登録するため、最新の値を参照できるようrefに控える
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const onAddSegmentRef = useRef(onAddSegment);
  onAddSegmentRef.current = onAddSegment;
  const onUpdateLabelRef = useRef(onUpdateLabel);
  onUpdateLabelRef.current = onUpdateLabel;
  const onUpdateRangeRef = useRef(onUpdateRange);
  onUpdateRangeRef.current = onUpdateRange;
  const onDeleteSegmentRef = useRef(onDeleteSegment);
  onDeleteSegmentRef.current = onDeleteSegment;
  const onMergeSegmentRef = useRef(onMergeSegment);
  onMergeSegmentRef.current = onMergeSegment;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // 区間は作り直さず配色だけ差し替えるため、区間ごとのupdateから最新の値を参照できるようrefに控える
  const editingLockedRef = useRef(editingLocked);
  editingLockedRef.current = editingLocked;
  const highlightedSegmentIdRef = useRef(highlightedSegmentId);
  highlightedSegmentIdRef.current = highlightedSegmentId;
  const processedSegmentIdsRef = useRef(processedSegmentIds);
  processedSegmentIdsRef.current = processedSegmentIds;
  const highlightUnlabeledSegmentsRef = useRef(highlightUnlabeledSegments);
  highlightUnlabeledSegmentsRef.current = highlightUnlabeledSegments;
  // 区間の塗りを波形・スペクトログラム・ラベル領域に塗り分ける位置。波形の縦幅が変わると区間ごと作り直されるため、
  // 作るときに参照するだけでよい
  const mainWaveformHeightRef = useRef(mainWaveformHeight);
  mainWaveformHeightRef.current = mainWaveformHeight;
  const spectrogramHeightRef = useRef(spectrogramHeight);
  spectrogramHeightRef.current = spectrogramHeight;
  const spectrogramColorMapRef = useRef(spectrogramColorMap);
  spectrogramColorMapRef.current = spectrogramColorMap;
  // 生成時に参照するだけで、変更は下のeffectでsetOptionsにより反映する(波形を作り直さないため)
  const playbackScrollModeRef = useRef(playbackScrollMode);
  playbackScrollModeRef.current = playbackScrollMode;
  // addRegion()での確定済み区間の描画も region-created イベントを発火するため、
  // ドラッグ由来の保留中区間の作成だけを検知できるよう確定済み区間のIDを控えておく
  const segmentIdsRef = useRef<Set<string>>(new Set());
  segmentIdsRef.current = new Set(segments.map((s) => s.id));
  // ラベル帯をクリックして編集・移動・削除できる状態になっている確定済み区間。同時に1つだけ
  const activeSegmentRef = useRef<{
    id: string;
    element: HTMLElement;
    deactivate: () => void;
    startEditing: () => void;
  } | null>(null);
  // 描画済みの区間ごとに、最新の区間データ(出どころによる配色・位置・ラベル)を反映する関数と、
  // キーボード操作から選択するための関数
  const segmentControlsRef = useRef(new Map<string, { update: (segment: Segment) => void; activate: () => void }>());
  // キーを押し始めるたびに作り直す。historyGroupKeyは押し続けている間のずらしを履歴上1つの操作にまとめるためのキー、
  // startedAtMsは押し続けた時間に応じて移動量を増やすための押し始めの時刻
  const nudgeHoldRef = useRef({ historyGroupKey: "", startedAtMs: 0 });

  const [isReady, setIsReady] = useState(false);
  const [isLoadFailed, setIsLoadFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [verticalZoom, setVerticalZoom] = useState(DEFAULT_VERTICAL_ZOOM);
  const [peakAmplitude, setPeakAmplitude] = useState(0);
  const [decodedSampleRate, setDecodedSampleRate] = useState(0);
  const [isSpectrogramComputing, setIsSpectrogramComputing] = useState(false);
  // 計算したスペクトログラムと、計算元のデコード済みの音声・窓の長さ(計算し直す必要があるか見分けるため)
  const spectrogramCacheRef = useRef<{ source: AudioBuffer; windowMs: number; data: SpectrogramData } | null>(null);
  // ホイールズーム時にカーソル下の位置を固定するための基準点。zoom自体はstate経由で別effectから反映されるため、
  // ホイール時点のカーソル位置(画面上のX座標)と、波形全体に対するその位置の割合をここに控えて受け渡す
  const zoomAnchorRef = useRef<{ clientX: number; ratio: number } | null>(null);

  useEffect(() => {
    zoomAnchorRef.current = null;
    setIsReady(false);
    setIsLoadFailed(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setZoom(DEFAULT_ZOOM);
    setVerticalZoom(DEFAULT_VERTICAL_ZOOM);
    setPeakAmplitude(0);
    setDecodedSampleRate(0);

    if (!containerRef.current || !audioUrl || !sourceSampleRate) return;

    const regions = RegionsPlugin.create();

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      // 再生位置の前後で波形の色を変えない(再生位置はカーソル線だけで示す)
      waveColor: "#9ca3af",
      progressColor: "#9ca3af",
      cursorColor: "#111827",
      height: mainWaveformHeight,
      url: audioUrl,
      // wavesurferの既定(8kHz)のままだとスペクトログラムが4kHzまでしか見えないため、Audacityと同じく元のサンプリング周波数で
      // デコードする(PLAN.md 5章)
      sampleRate: sourceSampleRate,
      normalize: true,
      minPxPerSec: DEFAULT_ZOOM,
      ...getPlaybackScrollOptions(playbackScrollModeRef.current),
      // 表示位置の移動は全体波形(Minimap)のドラッグとホイールで行うため、波形下のスクロールバーは見た目だけ消す
      // (このオプションはCSSで非表示にするだけで、スクロール自体はできる)
      hideScrollbar: true,
      plugins: [
        Minimap.create({
          height: minimapHeight,
          waveColor: "#c7c7cf",
          progressColor: "#9ca3af",
          overlayColor: "rgba(45, 45, 51, 0.15)",
          normalize: true,
          insertPosition: "beforebegin",
          // 再生位置(カーソル線)はメイン波形の中でだけ動かせるようにし、全体波形のクリックではシークしない。
          // 代わりに表示位置の移動に使う(attachMinimapScroll)
          interact: false,
        }),
        regions,
      ],
    });
    wavesurferRef.current = wavesurfer;
    regionsRef.current = regions;

    // 速さは音の高さを保てる標準の再生(media要素)のまま変えたいため、wavesurferのWebAudio再生には切り替えず、
    // media要素の音をGainNodeに通して増幅する。wavesurferは取得した音声をblob URLにして再生するため、
    // バックエンドが別オリジンでも音を取り出せる(別オリジンのURLを直接再生していると無音になる)
    const audioContext = new AudioContext();
    const gainNode = audioContext.createGain();
    audioContext
      .createMediaElementSource(wavesurfer.getMediaElement())
      .connect(gainNode)
      .connect(audioContext.destination);
    gainNodeRef.current = gainNode;

    // 波形の描画領域(height)の下にラベル領域ぶんの余白を足す。区間(Region)のコンテナはwrapper全体を覆うため
    // ラベル帯・調整帯はこの余白に収まり、縦方向に拡大しても波形がラベルに被らない
    wavesurfer.getWrapper().style.paddingBottom = `${LABEL_AREA_HEIGHT_PX}px`;

    // wrapperは波形全体の幅を持ち、拡大・スクロールに合わせて動くため、時間の割合で置けば波形と位置が揃う。
    // ラベル領域・スペクトログラムには被せず、波形の描画領域だけを覆う
    const detectionPreviewLayer = document.createElement("div");
    detectionPreviewLayer.style.cssText = `position:absolute;top:0;left:0;right:0;height:${mainWaveformHeight}px;z-index:2;pointer-events:none`;
    wavesurfer.getWrapper().appendChild(detectionPreviewLayer);
    detectionPreviewLayerRef.current = detectionPreviewLayer;

    const minimapElement = getMinimapElement(wavesurfer);
    minimapElementRef.current = minimapElement;
    const detachMinimapScroll = minimapElement ? attachMinimapScroll(minimapElement, wavesurfer) : () => {};
    if (minimapElement) {
      // 全体波形の上・表示範囲のハイライト(z-index:2)の下に重ねる。操作は全体波形側で受けるためpointer-eventsは無効化する
      const layer = document.createElement("div");
      layer.style.cssText = "position:absolute;inset:0;z-index:1;pointer-events:none";
      minimapElement.appendChild(layer);
      minimapSegmentLayerRef.current = layer;
    }
    // 補助線の表示・範囲・色は、下のeffectで反映する
    const timeAxisView = createTimeAxisView(wavesurfer);
    timeAxisViewRef.current = timeAxisView;

    // 位置・幅の変更は確定済み区間の調整帯でのみ行う方針のため、選択範囲も波形上でのドラッグ移動/リサイズは無効にする
    // (範囲を変えたいときはドラッグ選択をやり直す)
    const disableDragSelection = regions.enableDragSelection({
      color: SELECTION_REGION_COLOR,
      minLength: MIN_REGION_LENGTH_SEC,
      drag: false,
      resize: false,
    });

    // ドラッグ選択は「範囲を選ぶ」だけにとどめ、ラベル入力はショートカット(startLabelingSelection)で明示的に始める。
    // 選択範囲を範囲再生など、ラベル付け以外の操作の対象にもできるようにするため
    regions.on("region-created", (region) => {
      // 確定済み区間の再描画(addRegion)でもこのイベントが発火するため、そちらは無視する
      if (segmentIdsRef.current.has(region.id)) return;
      const previousSelection = selectionRegionRef.current;
      // 先に新しい方へ差し替えてからremove()する。逆順にすると、remove()でラベル入力中のcontentEditableが
      // 強制blurされた際、古い方のblurハンドラが「まだ自分が選択範囲である」と誤認して動いてしまう
      selectionRegionRef.current = region;
      labelingRef.current = null;
      previousSelection?.remove();
    });

    wavesurfer.on("ready", () => {
      const decodedData = wavesurfer.getDecodedData();
      const peak = getPeakAmplitude(decodedData);
      // wavesurferは波形を画面幅ごとのキャンバスに分けて描き、normalizeもキャンバスごとの最大値で行うため、
      // そのままでは横方向のズームで振幅の見え方が変わり、キャンバスの境目で振幅が不連続になる。
      // 音声全体の最大値を基準として渡し、縦軸の目盛り(visiblePeakAmplitude)とも一致させる
      wavesurfer.setOptions({ maxPeak: peak });
      setDuration(wavesurfer.getDuration());
      setPeakAmplitude(peak);
      setDecodedSampleRate(decodedData?.sampleRate ?? 0);
      setIsReady(true);
    });
    // 音声を切り替えたときの取得の中断は、destroy()でリスナーが外れた後に起きるためここには届かない
    wavesurfer.on("error", () => setIsLoadFailed(true));
    wavesurfer.on("play", () => {
      // ブラウザは操作を受ける前に作ったAudioContextを止めた状態にしておき、そのままでは音が出ないため、再生のたびに動かす
      void audioContext.resume();
      setIsPlaying(true);
    });
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));
    wavesurfer.on("timeupdate", (time) => setCurrentTime(time));

    return () => {
      detachMinimapScroll();
      timeAxisView.destroy();
      timeAxisViewRef.current = null;
      minimapElementRef.current = null;
      minimapSegmentLayerRef.current = null;
      detectionPreviewLayerRef.current = null;
      disableDragSelection();
      wavesurfer.destroy();
      void audioContext.close();
      wavesurferRef.current = null;
      // 前の音声のスペクトログラムは使わないため、メモリを空ける
      spectrogramCacheRef.current = null;
      regionsRef.current = null;
      gainNodeRef.current = null;
      selectionRegionRef.current = null;
      labelingRef.current = null;
      activeSegmentRef.current = null;
    };
  }, [containerRef, audioUrl, sourceSampleRate, mainWaveformHeight, minimapHeight]);

  // スペクトログラムは波形を作り直さずに出し入れする(作り直すと音声の再取得・表示位置のリセットが起きるため)。
  // 計算した結果は同じ音声・同じ窓の長さのあいだ持ち続け、表示を消して出し直しても計算し直さない(PLAN.md 5章)
  useEffect(() => {
    const wavesurfer = wavesurferRef.current;
    const decodedData = wavesurfer?.getDecodedData();
    if (!wavesurfer || !decodedData || !isReady || spectrogramHeight <= 0) return;
    const view = createSpectrogramView(wavesurfer, spectrogramHeight, spectrogramColorMap);
    const cached = spectrogramCacheRef.current;
    if (cached?.source === decodedData && cached.windowMs === spectrogramWindowMs) {
      view.setData(cached.data);
      return () => view.destroy();
    }
    setIsSpectrogramComputing(true);
    const cancel = requestSpectrogram(
      decodedData.getChannelData(0),
      decodedData.sampleRate,
      spectrogramWindowMs / 1000,
      (data) => {
        spectrogramCacheRef.current = { source: decodedData, windowMs: spectrogramWindowMs, data };
        setIsSpectrogramComputing(false);
        view.setData(data);
      },
    );
    return () => {
      cancel();
      setIsSpectrogramComputing(false);
      view.destroy();
    };
  }, [isReady, spectrogramHeight, spectrogramColorMap, spectrogramWindowMs]);

  // 縦の補助線は、メイン波形からラベル領域の下端まで引く。スペクトログラムの部分だけ色を変える
  useEffect(() => {
    const view = timeAxisViewRef.current;
    if (!view || !isReady) return;
    view.setGridLayout(mainWaveformHeight, spectrogramHeight, spectrogramColorMap);
    view.setGridVisible(showGridLines);
  }, [isReady, showGridLines, mainWaveformHeight, spectrogramHeight, spectrogramColorMap]);

  // 選択範囲を解除する(ラベル入力中なら入力も取り消される)。refだけを参照するため、一度だけ登録するハンドラからも呼べる
  const clearSelectionRegion = () => {
    const selection = selectionRegionRef.current;
    if (!selection) return;
    selectionRegionRef.current = null;
    labelingRef.current = null;
    selection.remove();
  };

  // 他の場所を押したら、その時点でアクティブな区間を非アクティブに戻し、選択範囲も解除する(Audacityと同様、
  // 選択範囲の上を押した場合も解除し、ドラッグならそのまま新しい選択範囲になる)。区間側や他の要素がstopPropagationしていても
  // 取りこぼさないよう、キャプチャフェーズで拾う。wavesurferは波形をShadow DOM内に描画しており、
  // document側ではe.targetがShadow DOMのホスト要素に置き換わってしまうため、composedPathで内側まで含めて判定する
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const path = e.composedPath();
      // 区間の選択・選択範囲は波形の中を押したときだけ解除する。再生ボタンなど波形の外の操作は、それらを対象に行えるよう残す。
      // 全体波形での操作も、表示位置を変えるだけなので解除しない
      if (!containerRef.current || !path.includes(containerRef.current)) return;
      if (minimapElementRef.current && path.includes(minimapElementRef.current)) return;
      const active = activeSegmentRef.current;
      if (active && !path.includes(active.element)) active.deactivate();

      // ラベル入力欄の操作では選択範囲を解除しない
      if (labelingRef.current && path.includes(labelingRef.current.content)) return;
      clearSelectionRegion();
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [containerRef]);

  // 確定済み区間を波形上に同期表示する(選択範囲は残す)。
  // 誤操作を防ぐため、確定済み区間は普段は表示のみとし、ラベル帯をクリックしたときだけアクティブ(選択)にして
  // 調整帯(ラベル帯の下)での移動/幅変更・ショートカットでの削除を有効にする。
  // ラベル文字の編集はさらにダブルクリックかショートカット(初期値: Enter)を押したときだけ。
  // 選択中にそのまま文字編集状態にしないのは、Delete等のキーが「区間の削除」か「文字の削除」か曖昧になるため。
  // 波形の中で区間の外側を押すと非アクティブに戻る。
  // RegionsPluginのcontentEditableオプションは常時編集可能にしてしまうため使わず、編集可否はここで切り替える。
  // 追加・削除された分だけregionを作成・削除し、既存分は作り直さず中身の変化だけを反映する。ここで全region作り直す方式にすると、
  // 別の区間の追加/削除/確定のたびに編集中(フォーカス中)のcontentEditableまで壊れて入力中の文字が消えてしまうため
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !isReady) return;

    const currentIds = new Set(segments.map((s) => s.id));
    const existingIds = new Set<string>();
    for (const region of regions.getRegions()) {
      if (region.id === selectionRegionRef.current?.id) continue;
      existingIds.add(region.id);
      if (currentIds.has(region.id)) continue;
      if (activeSegmentRef.current?.id === region.id) activeSegmentRef.current = null;
      segmentControlsRef.current.delete(region.id);
      region.remove();
    }

    for (const segment of segments) {
      if (existingIds.has(segment.id)) {
        segmentControlsRef.current.get(segment.id)?.update(segment);
        continue;
      }
      const id = segment.id;
      // 区間は作り直さないため、ラベルの比較・復元には生成時点ではなく常に最新の値を使う
      const getCurrentLabel = () => segmentsRef.current.find((s) => s.id === id)?.label ?? "";

      // 編集を止めた・再開したとき、文字起こしで処理中・処理済みの区間が変わったとき、未入力の区間の色分けを切り替えたときは、
      // 区間を作り直さず配色だけ切り替える
      const getColors = (latest: Segment) =>
        getSegmentColors(
          latest,
          editingLockedRef.current,
          highlightedSegmentIdRef.current,
          processedSegmentIdsRef.current,
          highlightUnlabeledSegmentsRef.current,
        );
      let colors = getColors(segment);
      const content = createLabelContent(segment.label, colors.labelBackground, colors.labelBorder);
      const region = regions.addRegion({
        id,
        start: segment.startSec,
        end: segment.endSec,
        // 塗りはcreateRegionFillの帯で行う
        color: "transparent",
        content,
        drag: false,
        resize: false,
      });
      const element = region.element;
      if (!element) continue;
      const fill = createRegionFill(
        element,
        mainWaveformHeightRef.current,
        spectrogramHeightRef.current,
        spectrogramColorMapRef.current,
      );
      fill.setColors(colors, false);

      // ドラッグ中は見た目(region)だけを動かし、離したときに一度だけ状態へ反映する。
      // 重なり等で反映できなければドラッグ開始時の位置に戻す
      let origin = { start: region.start, end: region.end };
      const adjustBar = createAdjustBar({
        onStart: () => {
          if (activeSegmentRef.current?.id !== id) activate();
          origin = { start: region.start, end: region.end };
        },
        onMove: (mode, deltaPx) => {
          const wavesurfer = wavesurferRef.current;
          if (!wavesurfer) return;
          const totalDuration = wavesurfer.getDuration();
          const deltaSec = (deltaPx / wavesurfer.getWrapper().getBoundingClientRect().width) * totalDuration;
          let { start, end } = origin;
          if (mode === "move") {
            const length = end - start;
            start = Math.min(Math.max(start + deltaSec, 0), totalDuration - length);
            end = start + length;
          } else if (mode === "start") {
            start = Math.min(Math.max(start + deltaSec, 0), end - MIN_REGION_LENGTH_SEC);
          } else {
            end = Math.max(Math.min(end + deltaSec, totalDuration), start + MIN_REGION_LENGTH_SEC);
          }
          region.setOptions({ start, end });
        },
        onEnd: () => {
          if (region.start === origin.start && region.end === origin.end) return;
          const error = onUpdateRangeRef.current(id, region.start, region.end);
          if (error) {
            onErrorRef.current(error);
            region.setOptions(origin);
          }
        },
      });
      element.appendChild(adjustBar.element);

      // 編集を止めている間は、調整帯を灰色にし、ラベル帯・調整帯にカーソルを当てても形を変えない(押しても何も起きないため)。
      // 未入力の区間を色分けしているときは、調整帯も区間と同じ赤系にする。
      // 文字起こしで処理中の区間のときだけ塗りを動かし、処理中でなくなったら止めてsetColorsで指定した色に戻す
      let pulses: Animation[] = [];
      const syncAppearance = () => {
        const locked = editingLockedRef.current;
        adjustBar.setLocked(locked);
        adjustBar.setUnlabeled(colors === UNLABELED_SEGMENT_COLORS);
        if (!content.isContentEditable) content.style.cursor = locked ? "default" : "pointer";
        const isHighlighted = colors === HIGHLIGHTED_SEGMENT_COLORS;
        if (isHighlighted && pulses.length === 0) {
          pulses = fill.statusBands.map((band) =>
            pulseHighlightedBackground(band, HIGHLIGHTED_SEGMENT_COLORS.region, PROCESSED_SEGMENT_COLORS.region),
          );
        } else if (!isHighlighted && pulses.length > 0) {
          pulses.forEach((pulse) => pulse.cancel());
          pulses = [];
        }
      };
      syncAppearance();

      const deactivate = () => {
        if (activeSegmentRef.current?.id !== id) return;
        activeSegmentRef.current = null;
        content.blur();
        adjustBar.setActive(false);
        fill.setColors(colors, false);
      };
      const activate = () => {
        activeSegmentRef.current?.deactivate();
        activeSegmentRef.current = { id, element, deactivate, startEditing };
        adjustBar.setActive(true);
        fill.setColors(colors, true);
      };
      // 区間は作り直さないため、同じIDのまま中身が変わったとき(元に戻す/やり直す、文字起こしの進行)は
      // ここで見た目に反映する。移動・幅変更・ラベル編集の直後は見た目が既に最新なので、値が変わったときだけ触る
      const update = (latest: Segment) => {
        colors = getColors(latest);
        setLabelContentColors(content, colors.labelBackground, colors.labelBorder);
        fill.setSpectrogram(spectrogramHeightRef.current, spectrogramColorMapRef.current);
        fill.setColors(colors, activeSegmentRef.current?.id === id);
        syncAppearance();
        if (region.start !== latest.startSec || region.end !== latest.endSec) {
          region.setOptions({ start: latest.startSec, end: latest.endSec });
        }
        if (!content.isContentEditable && content.textContent !== latest.label) content.textContent = latest.label;
      };
      segmentControlsRef.current.set(id, { update, activate });
      const startEditing = () => {
        content.contentEditable = "true";
        content.style.cursor = "text";
        focusAtEnd(content);
      };

      // 文字編集中はラベル帯を文字入力専用にする。ここでのドラッグ(文字選択)が新規のドラッグ選択として
      // 扱われないよう伝播を止める
      content.addEventListener("pointerdown", (e) => {
        if (content.isContentEditable) e.stopPropagation();
      });
      // ラベル帯のクリックは選択のための操作なので、波形のクリックによるシークは起こさない
      content.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeSegmentRef.current?.id !== id) activate();
      });
      content.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (activeSegmentRef.current?.id !== id) activate();
        startEditing();
      });
      // Enterで確定・Escで取り消して文字編集だけを終え、選択は残す(続けて結合・隣の区間への移動などをキーで行えるようにするため)。
      // blurで編集状態が外れた後にdocumentへ伝わると、同じキーが「文言の編集」「選択の解除」のショートカットとして
      // 続けて発火してしまうため、伝播を止める
      content.addEventListener("keydown", (e) => {
        if ((e.key !== "Enter" && e.key !== "Escape") || isImeComposing(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") content.textContent = getCurrentLabel();
        content.blur();
      });
      // 文字編集中に区間本体をドラッグしに行った場合もフォーカスが外れるため、確定は非アクティブ化ではなくblurで行う。
      // 確定後は選択状態のまま文字編集だけを終える
      content.addEventListener("blur", () => {
        content.contentEditable = "false";
        // 編集を止めたことで入力が終わったときは、カーソルの形を変えないままにする
        content.style.cursor = editingLockedRef.current ? "default" : "pointer";
        const label = sanitizeLabel(content.textContent ?? "");
        content.textContent = label;
        if (label !== getCurrentLabel()) onUpdateLabelRef.current(id, label);
      });
    }
    // 文字起こしの開始・終了、処理中の区間の移り変わり、未入力の区間の色分けの切り替え、スペクトログラムの出し入れ・
    // 色の表の切り替えでも見た目を更新するため、区間が変わらなくても走らせる
  }, [
    segments,
    isReady,
    editingLocked,
    highlightedSegmentId,
    processedSegmentIds,
    highlightUnlabeledSegments,
    spectrogramHeight,
    spectrogramColorMap,
  ]);

  // 全体波形の上に確定済み区間の範囲と、自動検出の途中経過を表示する。数が多くても描き直しは軽いため、変わるたびに全て作り直す
  useEffect(() => {
    const layer = minimapSegmentLayerRef.current;
    if (!layer || !isReady || duration <= 0) return;
    layer.replaceChildren(
      ...segments.map((segment) => {
        const colors = getSegmentColors(
          segment,
          editingLocked,
          highlightedSegmentId,
          processedSegmentIds,
          highlightUnlabeledSegments,
        );
        const bar = createRangeBar(segment, duration, colors.minimap);
        // 帯は作り直すたびに捨てるため、アニメーションも要素ごと消える
        if (colors === HIGHLIGHTED_SEGMENT_COLORS) {
          pulseHighlightedBackground(bar, HIGHLIGHTED_SEGMENT_COLORS.minimap, PROCESSED_SEGMENT_COLORS.minimap);
        }
        return bar;
      }),
      ...detectionPreviewRanges.map((range) => createRangeBar(range, duration, PROCESSED_SEGMENT_COLORS.minimap)),
    );
  }, [
    segments,
    isReady,
    duration,
    editingLocked,
    highlightedSegmentId,
    processedSegmentIds,
    detectionPreviewRanges,
    highlightUnlabeledSegments,
  ]);

  // メイン波形の上に自動検出の途中経過を表示する。終わると空になり、正式な区間に置き換わる
  useEffect(() => {
    const layer = detectionPreviewLayerRef.current;
    if (!layer || !isReady || duration <= 0) return;
    layer.replaceChildren(
      ...detectionPreviewRanges.map((range) => createRangeBar(range, duration, PROCESSED_SEGMENT_COLORS.region)),
    );
  }, [isReady, duration, detectionPreviewRanges]);

  // 編集を止めている間は、波形・ラベル領域での押す操作(シーク・ドラッグ選択・区間の選択・調整・文言の編集)を
  // 波形に届く前のキャプチャフェーズで止める。ホイールは止めないため、スクロール・拡大縮小はできる。
  // 全体波形のドラッグも表示位置を動かすだけなので通す。止める前に選択も外し、処理中の区間の色と紛れないようにする
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editingLocked) return;
    activeSegmentRef.current?.deactivate();
    clearSelectionRegion();
    const blockPointer = (e: Event) => {
      if (minimapElementRef.current && e.composedPath().includes(minimapElementRef.current)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const blockedEvents = ["pointerdown", "click", "dblclick"] as const;
    blockedEvents.forEach((type) => container.addEventListener(type, blockPointer, { capture: true }));
    return () => blockedEvents.forEach((type) => container.removeEventListener(type, blockPointer, { capture: true }));
  }, [containerRef, editingLocked]);

  // 再生中の表示位置の動かし方は、波形を作り直さずに設定だけ差し替える(作り直すと音声の再取得・表示位置のリセットが起きるため)
  useEffect(() => {
    if (!isReady) return;
    wavesurferRef.current?.setOptions(getPlaybackScrollOptions(playbackScrollMode));
  }, [playbackScrollMode, isReady]);

  // 音声の読み込みでmedia要素の速さは等速に戻るため、読み込み後(isReady)にも当て直す
  useEffect(() => {
    if (!isReady) return;
    wavesurferRef.current?.setPlaybackRate(playbackRate, true);
  }, [playbackRate, isReady]);

  useEffect(() => {
    if (!isReady || !gainNodeRef.current) return;
    gainNodeRef.current.gain.value = volume;
  }, [volume, isReady]);

  // 横方向の拡大率(1秒あたりのピクセル数)が変わるたびに反映する。ホイール由来のズームなら、
  // wavesurfer標準の「再生位置を固定する」スクロール補正を上書きし、カーソル下の位置が動かないようにする
  useEffect(() => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer || !isReady) return;
    wavesurfer.zoom(zoom);

    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!anchor) return;
    const rect = wavesurfer.getWrapper().getBoundingClientRect();
    wavesurfer.setScroll(wavesurfer.getScroll() + rect.left + anchor.ratio * rect.width - anchor.clientX);
  }, [zoom, isReady]);

  // 縦方向の拡大率(barHeight)が変わるたびに反映する
  useEffect(() => {
    if (!isReady) return;
    wavesurferRef.current?.setOptions({ barHeight: verticalZoom });
  }, [verticalZoom, isReady]);

  // Cmd/Ctrl+スクロールで横方向(zoom)を拡大縮小する。ブラウザ標準のページズームと
  // 衝突するため、この組み合わせの時だけpreventDefaultし、通常のスクロールは素通しする
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const wrapper = wavesurferRef.current?.getWrapper();
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        zoomAnchorRef.current = { clientX: e.clientX, ratio: (e.clientX - rect.left) / rect.width };
      }
      setZoom((prev) => applyWheelZoomStep(prev, e.deltaY, MIN_ZOOM, MAX_ZOOM));
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [containerRef]);

  // 縦の目盛り(AmplitudeAxis)上でのCmd/Ctrl+スクロールで縦方向(verticalZoom)を拡大縮小する。
  // 横方向のホイールズームと同じ操作感にするため、対象要素が違うだけでロジックは共通化している
  useEffect(() => {
    const axis = amplitudeAxisRef.current;
    if (!axis) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setVerticalZoom((prev) => applyWheelZoomStep(prev, e.deltaY, MIN_VERTICAL_ZOOM, MAX_VERTICAL_ZOOM));
    };
    axis.addEventListener("wheel", onWheel, { passive: false });
    return () => axis.removeEventListener("wheel", onWheel);
  }, [amplitudeAxisRef]);

  // 選択範囲、または選択中の確定済み区間があれば、Audacityと同様にその先頭から再生して末尾で止める。
  // どちらもなければ現在の再生位置から通常再生する
  const togglePlay = () => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer) return;
    if (wavesurfer.isPlaying()) {
      wavesurfer.pause();
      return;
    }
    const selection = selectionRegionRef.current;
    const activeId = activeSegmentRef.current?.id;
    const activeSegment = activeId ? segmentsRef.current.find((s) => s.id === activeId) : undefined;
    if (selection) void wavesurfer.play(selection.start, selection.end);
    else if (activeSegment) void wavesurfer.play(activeSegment.startSec, activeSegment.endSec);
    else void wavesurfer.play();
  };

  // 選択中の区間は操作のたびにrefで控えているだけでstateにはしていないため、使う時点で取り出す
  const getSelectedSegment = () => {
    const activeId = activeSegmentRef.current?.id;
    return (activeId && segmentsRef.current.find((s) => s.id === activeId)) || null;
  };

  const deleteSelectedSegment = () => {
    const active = activeSegmentRef.current;
    if (!active) return false;
    activeSegmentRef.current = null;
    onDeleteSegmentRef.current(active.id);
    return true;
  };

  const deselectSegment = () => {
    const active = activeSegmentRef.current;
    if (!active) return false;
    active.deactivate();
    return true;
  };

  // キーボードで選択を移したときは、続けて再生ボタン・ショートカットでその区間を聞けるよう、再生を止めて再生位置を区間の先頭に置く。
  // ラベル帯のクリックと同様、選択範囲は解除する(残っていると再生の対象が選択範囲になってしまうため)
  const selectAdjacentSegment = (direction: SegmentDirection) => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer) return false;
    const segments = segmentsRef.current;
    const activeId = activeSegmentRef.current?.id;
    let target: Segment | undefined;
    if (activeId) {
      target = findAdjacentSegment(segments, activeId, direction);
    } else {
      const time = wavesurfer.getCurrentTime();
      const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
      target = direction === "next" ? sorted.find((s) => s.startSec > time) : sorted.findLast((s) => s.startSec < time);
    }
    const controls = target && segmentControlsRef.current.get(target.id);
    if (!target || !controls) return false;
    clearSelectionRegion();
    controls.activate();
    wavesurfer.pause();
    wavesurfer.setTime(target.startSec);
    scrollSegmentIntoView(wavesurfer, target);
    return true;
  };

  const editSelectedSegmentLabel = () => {
    const active = activeSegmentRef.current;
    if (!active) return false;
    active.startEditing();
    return true;
  };

  // 選択中の区間や結合する相手がなくてもキーは素通ししない。初期値のAlt + ←はWindowsのブラウザでは「戻る」のため、
  // 素通しすると編集画面から離れてしまう
  const mergeSelectedSegment = (direction: SegmentDirection) => {
    const active = activeSegmentRef.current;
    if (active) onMergeSegmentRef.current(active.id, direction);
  };

  // 調整帯でのドラッグと同じ制約(音声の範囲内・最短の長さ)をかけ、重なりなどはonUpdateRangeの検証に任せる。
  // 選択中の区間がない・端に達して動かせないときもキーは素通ししない。初期値の⌘ + ←はMacのブラウザでは「戻る」のため、
  // 素通しすると編集画面から離れてしまう
  // キーを押し続けてずらした分は、元に戻すときに1回で戻せるよう1つの操作にまとめる。
  // 押し続けると移動量を設定値の整数倍に増やす(整数倍にするのは、位置が設定値の刻みからずれないようにするため)
  const nudgeSelectedSegment = (edge: "start" | "end", direction: "left" | "right", isRepeat: boolean) => {
    if (!isRepeat) nudgeHoldRef.current = { historyGroupKey: crypto.randomUUID(), startedAtMs: performance.now() };
    const wavesurfer = wavesurferRef.current;
    const activeId = activeSegmentRef.current?.id;
    const segment = activeId ? segmentsRef.current.find((s) => s.id === activeId) : undefined;
    if (!wavesurfer || !segment) return;
    const heldMs = performance.now() - nudgeHoldRef.current.startedAtMs;
    const stageMultiplier = NUDGE_ACCELERATION_STAGES.findLast((stage) => heldMs >= stage.afterMs)?.multiplier ?? 1;
    const maxMultiplier = Math.max(1, Math.floor(MAX_ACCELERATED_NUDGE_STEP_MS / segmentNudgeStepMs));
    const stepSec = (segmentNudgeStepMs * Math.min(stageMultiplier, maxMultiplier)) / 1000;
    const delta = direction === "left" ? -stepSec : stepSec;
    let { startSec, endSec } = segment;
    if (edge === "start") {
      startSec = Math.min(Math.max(roundFloatingError(startSec + delta), 0), endSec - MIN_REGION_LENGTH_SEC);
    } else {
      endSec = Math.max(
        Math.min(roundFloatingError(endSec + delta), wavesurfer.getDuration()),
        startSec + MIN_REGION_LENGTH_SEC,
      );
    }
    if (startSec === segment.startSec && endSec === segment.endSec) return;
    const error = onUpdateRangeRef.current(segment.id, startSec, endSec, nudgeHoldRef.current.historyGroupKey);
    if (error) onErrorRef.current(error);
  };

  // 選択範囲の下に、その場でラベルを打ち込めるcontentEditableな帯をセットする
  const startLabelingSelection = () => {
    const region = selectionRegionRef.current;
    if (!region || labelingRef.current) return false;
    // 文字を打ち終えてから確定で失敗すると入力が無駄になるため、入力を始める前に検証する。
    // (エラー表示のダイアログにフォーカスが移ると、入力欄のblurで入力も取り消されてしまう)
    const error = validateNewSegment(region.start, region.end);
    if (error) {
      onErrorRef.current(error);
      return true;
    }
    activeSegmentRef.current?.deactivate();

    const content = createLabelContent("", "rgba(255, 247, 237, 0.95)", "#f97316");
    region.setContent(content);
    const isCurrent = () => selectionRegionRef.current === region && labelingRef.current?.cancel === cancel;

    // 確定はEnterの明示的な操作のみに限定し、それ以外の理由でのblur
    // (例: 別の場所で新しいドラッグ選択を始めた)は入力の取り消しとして扱う。
    // 取り消しても選択範囲は残すので、続けて範囲再生したり、入力し直したりできる
    const commit = () => {
      if (!isCurrent()) return;
      const error = onAddSegmentRef.current(region.start, region.end, sanitizeLabel(content.textContent ?? ""));
      if (error) {
        onErrorRef.current(error);
        return;
      }
      selectionRegionRef.current = null;
      labelingRef.current = null;
      region.remove();
    };
    const cancel = () => {
      if (!isCurrent()) return;
      // 先に解除しておく。setContent()でフォーカス中の帯を外すとblurが発火し、このcancelが再入するため
      labelingRef.current = null;
      region.setContent(undefined);
    };
    content.addEventListener("keydown", (e) => {
      if (isImeComposing(e)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
    content.addEventListener("blur", cancel);
    // 帯の中での文字選択・キャレット移動が、新しいドラッグ選択や波形のクリック(シーク)として扱われないよう伝播を止める
    content.addEventListener("pointerdown", (e) => e.stopPropagation());
    content.addEventListener("click", (e) => e.stopPropagation());
    labelingRef.current = { cancel, content };
    content.contentEditable = "true";
    focusAtEnd(content);
    return true;
  };

  return {
    isReady,
    isLoadFailed,
    isPlaying,
    currentTime,
    duration,
    visiblePeakAmplitude: peakAmplitude / verticalZoom,
    spectrogramMaxFrequency: getMaxDisplayFrequency(decodedSampleRate),
    isSpectrogramComputing,
    togglePlay,
    getSelectedSegment,
    deleteSelectedSegment,
    deselectSegment,
    selectAdjacentSegment,
    editSelectedSegmentLabel,
    mergeSelectedSegment,
    nudgeSelectedSegment,
    startLabelingSelection,
  };
}
