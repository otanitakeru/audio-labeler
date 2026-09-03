import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Minimap from "wavesurfer.js/plugins/minimap";
import RegionsPlugin, { type Region } from "wavesurfer.js/plugins/regions";
import type { Segment } from "../types";

// メイン波形を拡大表示する際の1秒あたりの初期ピクセル数(全体はMinimapで確認する)
const DEFAULT_ZOOM = 100;
export const MIN_ZOOM = 20;
export const MAX_ZOOM = 500;
// 縦方向の拡大率(wavesurferのbarHeight)。1が基準(振幅ピークが枠いっぱい)で、
// 大きいほど小さな振幅が見やすくなる代わりに大きな振幅は枠からはみ出す
const DEFAULT_VERTICAL_ZOOM = 1;
export const MIN_VERTICAL_ZOOM = 1;
export const MAX_VERTICAL_ZOOM = 10;
const PENDING_REGION_COLOR = "rgba(234, 88, 12, 0.3)";
const SEGMENT_REGION_COLOR = "rgba(37, 99, 235, 0.25)";

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
};

type UseWavesurferResult = {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  zoom: number;
  setZoom: (zoom: number) => void;
  verticalZoom: number;
  setVerticalZoom: (verticalZoom: number) => void;
  // 縦軸の目盛りに表示すべき絶対振幅値(0〜1)。normalize:trueとverticalZoomの効果を反映した、
  // 現在枠いっぱいに描画されている振幅の絶対値
  visiblePeakAmplitude: number;
  togglePlay: () => void;
  clearPendingRegion: () => void;
};

export function useWavesurfer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  audioUrl: string | null,
  { segments, onRegionCreated, mainWaveformHeight, minimapHeight }: UseWavesurferOptions,
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
    zoom,
    setZoom,
    verticalZoom,
    setVerticalZoom,
    visiblePeakAmplitude: peakAmplitude / verticalZoom,
    togglePlay,
    clearPendingRegion,
  };
}
