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
const PENDING_REGION_COLOR = "rgba(234, 88, 12, 0.3)";
const SEGMENT_REGION_COLOR = "rgba(37, 99, 235, 0.25)";
// Cmd/Ctrl+スクロール1ステップあたりのズーム倍率
const WHEEL_ZOOM_FACTOR = 1.1;

// Cmd/Ctrl+スクロール1ステップぶん、現在値をズーム倍率で拡大縮小する(min〜maxにクランプ)。
// 横方向(zoom)・縦方向(verticalZoom)のどちらのホイールズームでも同じ計算を使う
function applyWheelZoomStep(
  prev: number,
  deltaY: number,
  min: number,
  max: number,
): number {
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

type UseWavesurferOptions = {
  segments: Segment[];
  onRegionCreated: (startSec: number, endSec: number) => void;
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
  clearPendingRegion: () => void;
};

export function useWavesurfer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  audioUrl: string | null,
  {
    segments,
    onRegionCreated,
    mainWaveformHeight,
    minimapHeight,
    amplitudeAxisRef,
  }: UseWavesurferOptions,
): UseWavesurferResult {
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const pendingRegionRef = useRef<Region | null>(null);
  const onRegionCreatedRef = useRef(onRegionCreated);
  onRegionCreatedRef.current = onRegionCreated;
  // addRegion()での確定済み区間の描画もregion-createdイベントを発火するため、
  // ドラッグ由来の作成だけを検知できるよう確定済み区間のIDを控えておく
  const segmentIdsRef = useRef<Set<string>>(new Set());
  segmentIdsRef.current = new Set(segments.map((s) => s.id));

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [verticalZoom, setVerticalZoom] = useState(DEFAULT_VERTICAL_ZOOM);
  const [peakAmplitude, setPeakAmplitude] = useState(0);

  useEffect(() => {
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
      waveColor: "#9ca3af",
      progressColor: "#4b5563",
      height: mainWaveformHeight,
      url: audioUrl,
      normalize: true,
      minPxPerSec: DEFAULT_ZOOM,
      plugins: [
        Minimap.create({
          height: minimapHeight,
          waveColor: "#c7c7cf",
          progressColor: "#9ca3af",
          overlayColor: "rgba(45, 45, 51, 0.15)",
          normalize: true,
          insertPosition: "beforebegin",
        }),
        regions,
      ],
    });
    wavesurferRef.current = wavesurfer;
    regionsRef.current = regions;

    // wavesurferの hideScrollbar オプションは overflow: hidden にしてスクロール自体を無効化してしまい、
    // ズーム時に音声の先頭以降を表示・Minimapのハイライト表示ができなくなるため使わない。
    // (CSSでスクロールバーの見た目だけを消す方法は、スクロールバーの表示/非表示切り替えが
    // clientWidthの変化を招きレイアウトが無限に往復するバグになったため見送り、素直に表示する)

    const disableDragSelection = regions.enableDragSelection({
      color: PENDING_REGION_COLOR,
    });

    regions.on("region-created", (region) => {
      // 確定済み区間の再描画(addRegion)でもこのイベントが発火するため、そちらは無視する
      if (segmentIdsRef.current.has(region.id)) return;
      pendingRegionRef.current?.remove();
      pendingRegionRef.current = region;
      onRegionCreatedRef.current(region.start, region.end);
    });

    wavesurfer.on("ready", () => {
      setDuration(wavesurfer.getDuration());
      setPeakAmplitude(getPeakAmplitude(wavesurfer.getDecodedData()));
      setIsReady(true);
    });
    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));
    wavesurfer.on("timeupdate", (time) => setCurrentTime(time));

    return () => {
      disableDragSelection();
      wavesurfer.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
      pendingRegionRef.current = null;
    };
  }, [containerRef, audioUrl, mainWaveformHeight, minimapHeight]);

  // 確定済み区間を常にリージョンとして同期表示する(保留中のドラッグ区間は残す)
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !isReady) return;

    const pendingId = pendingRegionRef.current?.id;
    for (const region of regions.getRegions()) {
      if (region.id !== pendingId) region.remove();
    }
    for (const segment of segments) {
      regions.addRegion({
        id: segment.id,
        start: segment.startSec,
        end: segment.endSec,
        color: SEGMENT_REGION_COLOR,
        content: segment.label,
        drag: false,
        resize: false,
      });
    }
  }, [segments, isReady]);

  // 横方向の拡大率(1秒あたりのピクセル数)が変わるたびに反映する
  useEffect(() => {
    if (!isReady) return;
    wavesurferRef.current?.zoom(zoom);
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
      setVerticalZoom((prev) =>
        applyWheelZoomStep(
          prev,
          e.deltaY,
          MIN_VERTICAL_ZOOM,
          MAX_VERTICAL_ZOOM,
        ),
      );
    };
    axis.addEventListener("wheel", onWheel, { passive: false });
    return () => axis.removeEventListener("wheel", onWheel);
  }, [amplitudeAxisRef]);

  const togglePlay = () => {
    wavesurferRef.current?.playPause();
  };

  const clearPendingRegion = () => {
    pendingRegionRef.current?.remove();
    pendingRegionRef.current = null;
  };

  return {
    isReady,
    isPlaying,
    currentTime,
    duration,
    visiblePeakAmplitude: peakAmplitude / verticalZoom,
    togglePlay,
    clearPendingRegion,
  };
}
