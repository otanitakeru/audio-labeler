import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Minimap from "wavesurfer.js/plugins/minimap";
import RegionsPlugin, { type Region } from "wavesurfer.js/plugins/regions";
import type { Segment } from "../types";

// メイン波形を拡大表示する際の1秒あたりの初期ピクセル数(全体はMinimapで確認する)
const DEFAULT_ZOOM = 100;
// Cmd/Ctrl+スクロールでの拡大率(1秒あたりのピクセル数)の可動域。UIにスライダーは出さず、
// ホイール操作でのみ変更する(スライダーだとホイールとの二重の入力経路になるため設けない)
const MIN_ZOOM = 20;
const MAX_ZOOM = 1000;
// 縦方向の拡大率(wavesurferのbarHeight)。1が基準(振幅ピークが枠いっぱい)で、
// 大きいほど小さな振幅が見やすくなる代わりに大きな振幅は枠からはみ出す
const DEFAULT_VERTICAL_ZOOM = 0.9;
const MIN_VERTICAL_ZOOM = 0.9;
const MAX_VERTICAL_ZOOM = 10;
// Cmd/Ctrl+スクロール1ステップあたりのズーム倍率
const WHEEL_ZOOM_FACTOR = 1.1;
// リサイズ/ドラッグ選択時に区間の長さが0にならないようにする下限(秒)
const MIN_REGION_LENGTH_SEC = 0.01;

const SELECTION_REGION_COLOR = "rgba(234, 88, 12, 0.15)";
const SEGMENT_REGION_COLOR = "rgba(37, 99, 235, 0.12)";
const ACTIVE_SEGMENT_REGION_COLOR = "rgba(37, 99, 235, 0.25)";
// 全体波形上に重ねる確定済み区間の色。全体波形は縦幅が小さく薄い色だと見えにくいため、メイン波形より濃くする
const MINIMAP_SEGMENT_COLOR = "rgba(37, 99, 235, 0.3)";
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

// タブ・改行は出力フォーマット(タブ区切り)を壊すため半角スペースに置き換える。
// contentEditableには貼り付けでこれらが混入しうるため、確定時に必ず通す
function sanitizeLabel(text: string): string {
  return text.replace(/[\t\n\r]/g, " ");
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
    `background:${background}`,
    `border-top:1px solid ${borderColor}`,
    "white-space:nowrap",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "outline:none",
    "cursor:text",
    "box-sizing:border-box",
  ].join(";");
  el.addEventListener("focus", () => {
    el.style.outline = `2px solid ${borderColor}`;
    el.style.outlineOffset = "-2px";
  });
  el.addEventListener("blur", () => {
    el.style.outline = "none";
  });
  return el;
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
};

// 調整帯の配色。非選択時も「掴める」ことが分かる程度に見せ、選択中・ホバー中は濃くする
const ADJUST_TRACK_COLOR = {
  idle: "rgba(37, 99, 235, 0.12)",
  hover: "rgba(37, 99, 235, 0.22)",
  active: "rgba(37, 99, 235, 0.3)",
};
const ADJUST_KNOB_COLOR = { idle: "#93c5fd", hover: "#60a5fa", active: "#2563eb" };

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
  const render = () => {
    const state = isActive ? "active" : isHovered ? "hover" : "idle";
    bar.style.backgroundColor = ADJUST_TRACK_COLOR[state];
    startKnob.style.backgroundColor = ADJUST_KNOB_COLOR[state];
    endKnob.style.backgroundColor = ADJUST_KNOB_COLOR[state];
    grip.style.backgroundImage = `radial-gradient(circle, ${ADJUST_KNOB_COLOR[state]} 1.5px, transparent 1.5px)`;
    grip.style.backgroundSize = "5px 4px";
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
  onUpdateRange: (id: string, startSec: number, endSec: number) => string | null;
  onDeleteSegment: (id: string) => void;
  // 重なりなど、ユーザー操作に起因するエラーをまとめて通知する
  onError: (message: string) => void;
  mainWaveformHeight: number;
  minimapHeight: number;
  // 縦の目盛り(AmplitudeAxis)上でのCmd/Ctrl+スクロールをverticalZoomに反映するための参照
  amplitudeAxisRef: React.RefObject<HTMLDivElement | null>;
};

type UseWavesurferResult = {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  // 縦軸の目盛りに表示すべき絶対振幅値(0〜1)。normalize:trueとverticalZoomの効果を反映した、
  // 現在枠いっぱいに描画されている振幅の絶対値
  visiblePeakAmplitude: number;
  togglePlay: () => void;
  // 選択中の区間がなければfalseを返す(ショートカットとして使ったとき、キー本来の動作を妨げないため)
  deleteSelectedSegment: () => boolean;
  deselectSegment: () => boolean;
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
    onError,
    mainWaveformHeight,
    minimapHeight,
    amplitudeAxisRef,
  }: UseWavesurferOptions,
): UseWavesurferResult {
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  // 波形上のドラッグ選択で作られる選択範囲。確定済み区間とは別物で、同時に1つだけ。
  // ラベル入力(startLabelingSelection)や、将来の範囲再生の対象になるため、ラベル入力とは独立した状態として持つ
  const selectionRegionRef = useRef<Region | null>(null);
  // 選択範囲にラベル入力中なら、その入力を取り消す(選択範囲自体は残す)関数と、入力欄の要素
  const labelingRef = useRef<{ cancel: () => void; content: HTMLElement } | null>(null);
  const minimapElementRef = useRef<HTMLElement | null>(null);
  // 全体波形の上に確定済み区間の範囲を表示するレイヤー
  const minimapSegmentLayerRef = useRef<HTMLDivElement | null>(null);
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
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // addRegion()での確定済み区間の描画も region-created イベントを発火するため、
  // ドラッグ由来の保留中区間の作成だけを検知できるよう確定済み区間のIDを控えておく
  const segmentIdsRef = useRef<Set<string>>(new Set());
  segmentIdsRef.current = new Set(segments.map((s) => s.id));
  // ラベル帯をクリックして編集・移動・削除できる状態になっている確定済み区間。同時に1つだけ
  const activeSegmentRef = useRef<{ id: string; element: HTMLElement; deactivate: () => void } | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [verticalZoom, setVerticalZoom] = useState(DEFAULT_VERTICAL_ZOOM);
  const [peakAmplitude, setPeakAmplitude] = useState(0);
  // ホイールズーム時にカーソル下の位置を固定するための基準点。zoom自体はstate経由で別effectから反映されるため、
  // ホイール時点のカーソル位置(画面上のX座標)と、波形全体に対するその位置の割合をここに控えて受け渡す
  const zoomAnchorRef = useRef<{ clientX: number; ratio: number } | null>(null);

  useEffect(() => {
    zoomAnchorRef.current = null;
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setZoom(DEFAULT_ZOOM);
    setVerticalZoom(DEFAULT_VERTICAL_ZOOM);
    setPeakAmplitude(0);

    if (!containerRef.current || !audioUrl) return;

    const regions = RegionsPlugin.create();

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      // 再生位置の前後で波形の色を変えない(再生位置はカーソル線だけで示す)
      waveColor: "#9ca3af",
      progressColor: "#9ca3af",
      cursorColor: "#111827",
      height: mainWaveformHeight,
      url: audioUrl,
      normalize: true,
      minPxPerSec: DEFAULT_ZOOM,
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

    // 波形の描画領域(height)の下にラベル領域ぶんの余白を足す。区間(Region)のコンテナはwrapper全体を覆うため
    // ラベル帯・調整帯はこの余白に収まり、縦方向に拡大しても波形がラベルに被らない
    wavesurfer.getWrapper().style.paddingBottom = `${LABEL_AREA_HEIGHT_PX}px`;

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
      const peak = getPeakAmplitude(wavesurfer.getDecodedData());
      // wavesurferは波形を画面幅ごとのキャンバスに分けて描き、normalizeもキャンバスごとの最大値で行うため、
      // そのままでは横方向のズームで振幅の見え方が変わり、キャンバスの境目で振幅が不連続になる。
      // 音声全体の最大値を基準として渡し、縦軸の目盛り(visiblePeakAmplitude)とも一致させる
      wavesurfer.setOptions({ maxPeak: peak });
      setDuration(wavesurfer.getDuration());
      setPeakAmplitude(peak);
      setIsReady(true);
    });
    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));
    wavesurfer.on("timeupdate", (time) => setCurrentTime(time));

    return () => {
      detachMinimapScroll();
      minimapElementRef.current = null;
      minimapSegmentLayerRef.current = null;
      disableDragSelection();
      wavesurfer.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
      selectionRegionRef.current = null;
      labelingRef.current = null;
      activeSegmentRef.current = null;
    };
  }, [containerRef, audioUrl, mainWaveformHeight, minimapHeight]);

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

      const selection = selectionRegionRef.current;
      if (!selection) return;
      // ラベル入力欄の操作では選択範囲を解除しない
      if (labelingRef.current && path.includes(labelingRef.current.content)) return;
      selectionRegionRef.current = null;
      labelingRef.current = null;
      selection.remove();
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [containerRef]);

  // 確定済み区間を波形上に同期表示する(選択範囲は残す)。
  // 誤操作を防ぐため、確定済み区間は普段は表示のみとし、ラベル帯をクリックしたときだけアクティブ(選択)にして
  // 調整帯(ラベル帯の下)での移動/幅変更・ショートカットでの削除を有効にする。ラベル文字の編集はさらにダブルクリックしたときだけ。
  // 選択中にそのまま文字編集状態にしないのは、Delete等のキーが「区間の削除」か「文字の削除」か曖昧になるため。
  // 波形の中で区間の外側を押すと非アクティブに戻る。
  // RegionsPluginのcontentEditableオプションは常時編集可能にしてしまうため使わず、編集可否はここで切り替える。
  // 追加・削除された分の差分だけをregionsへ反映し、既存分はそのまま残す。ここで全region作り直す方式にすると、
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
      region.remove();
    }

    for (const segment of segments) {
      if (existingIds.has(segment.id)) continue;
      const id = segment.id;
      // 区間は作り直さないため、ラベルの比較・復元には生成時点ではなく常に最新の値を使う
      const getCurrentLabel = () => segmentsRef.current.find((s) => s.id === id)?.label ?? "";

      const content = createLabelContent(segment.label, "rgba(239, 246, 255, 0.95)", "#2563eb");
      content.style.cursor = "pointer";
      const region = regions.addRegion({
        id,
        start: segment.startSec,
        end: segment.endSec,
        color: SEGMENT_REGION_COLOR,
        content,
        drag: false,
        resize: false,
      });
      const element = region.element;
      if (!element) continue;

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

      const deactivate = () => {
        if (activeSegmentRef.current?.id !== id) return;
        activeSegmentRef.current = null;
        content.blur();
        adjustBar.setActive(false);
        region.setOptions({ color: SEGMENT_REGION_COLOR });
      };
      const activate = () => {
        activeSegmentRef.current?.deactivate();
        activeSegmentRef.current = { id, element, deactivate };
        adjustBar.setActive(true);
        region.setOptions({ color: ACTIVE_SEGMENT_REGION_COLOR });
      };
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
      content.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          deactivate();
        } else if (e.key === "Escape") {
          e.preventDefault();
          content.textContent = getCurrentLabel();
          deactivate();
        }
      });
      // 文字編集中に区間本体をドラッグしに行った場合もフォーカスが外れるため、確定は非アクティブ化ではなくblurで行う。
      // 確定後は選択状態のまま文字編集だけを終える
      content.addEventListener("blur", () => {
        content.contentEditable = "false";
        content.style.cursor = "pointer";
        const label = sanitizeLabel(content.textContent ?? "");
        content.textContent = label;
        if (label !== getCurrentLabel()) onUpdateLabelRef.current(id, label);
      });
    }
  }, [segments, isReady]);

  // 全体波形の上に確定済み区間の範囲を表示する。数が多くても描き直しは軽いため、区間が変わるたびに全て作り直す
  useEffect(() => {
    const layer = minimapSegmentLayerRef.current;
    if (!layer || !isReady || duration <= 0) return;
    layer.replaceChildren(
      ...segments.map((segment) => {
        const bar = document.createElement("div");
        bar.style.cssText = [
          "position:absolute",
          "top:0",
          "bottom:0",
          `left:${(segment.startSec / duration) * 100}%`,
          `width:${((segment.endSec - segment.startSec) / duration) * 100}%`,
          `background:${MINIMAP_SEGMENT_COLOR}`,
        ].join(";");
        return bar;
      }),
    );
  }, [segments, isReady, duration]);

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
    isPlaying,
    currentTime,
    duration,
    visiblePeakAmplitude: peakAmplitude / verticalZoom,
    togglePlay,
    deleteSelectedSegment,
    deselectSegment,
    startLabelingSelection,
  };
}
