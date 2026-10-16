import { getSpectrogramLayout, type SpectrogramData } from "./computeSpectrogram";
import type { SpectrogramRequest, SpectrogramResponse } from "./spectrogramWorker";

// 1回にWeb Workerへ渡す音声の長さ(秒)
const CHUNK_SEC = 30;

// Web Workerに音声全体のスペクトログラムの計算を頼み、終わったらonDoneを呼ぶ。戻り値は中止する関数
// (中止したらonDoneは呼ばれない)。windowSecは分析の窓の長さ(秒)
export function requestSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  windowSec: number,
  onDone: (data: SpectrogramData) => void,
): () => void {
  const layout = getSpectrogramLayout(samples.length, sampleRate, windowSec);
  const framesPerChunk = Math.max(1, Math.round((CHUNK_SEC * sampleRate) / layout.hopLength));
  const worker = new Worker(new URL("./spectrogramWorker.ts", import.meta.url), { type: "module" });
  const send = (request: SpectrogramRequest, transfer: Transferable[] = []) => worker.postMessage(request, transfer);

  // 渡した配列はこちらからは使えなくなる。元の配列はwavesurferが波形の描画に使い続けるため、複製を渡す。
  // 全体の複製を一度に作らないよう、Workerが1つ計算し終えてから次を複製して渡す
  let nextFrame = 0;
  const sendNextChunk = () => {
    if (nextFrame >= layout.frameCount) {
      send({ type: "end" });
      return;
    }
    const frameCount = Math.min(framesPerChunk, layout.frameCount - nextFrame);
    const start = nextFrame * layout.hopLength;
    const end = (nextFrame + frameCount - 1) * layout.hopLength + layout.windowLength;
    const chunk = samples.slice(start, end);
    send({ type: "chunk", samples: chunk, firstFrame: nextFrame, frameCount }, [chunk.buffer]);
    nextFrame += frameCount;
  };

  worker.addEventListener("message", (e: MessageEvent<SpectrogramResponse>) => {
    if (e.data.type === "chunkDone") {
      sendNextChunk();
      return;
    }
    worker.terminate();
    onDone(e.data.data);
  });
  send({ type: "start", layout, sampleRate });
  sendNextChunk();
  return () => worker.terminate();
}
