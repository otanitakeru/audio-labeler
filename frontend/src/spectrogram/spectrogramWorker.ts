import {
  createSpectrogramComputer,
  type SpectrogramComputer,
  type SpectrogramData,
  type SpectrogramLayout,
} from "./computeSpectrogram";

// 音声は少しずつ渡す(PLAN.md 5章)。startで計算の準備をし、chunkを1つ受け取るたびにchunkDoneを返して次を待ち、
// endで計算結果を返す
export type SpectrogramRequest =
  | { type: "start"; layout: SpectrogramLayout; sampleRate: number }
  | { type: "chunk"; samples: Float32Array; firstFrame: number; frameCount: number }
  | { type: "end" };

export type SpectrogramResponse = { type: "chunkDone" } | { type: "done"; data: SpectrogramData };

// 25分の音声で数秒かかるため、計算中も画面の操作を止めないようWeb Workerで動かす
let computer: SpectrogramComputer | null = null;
self.addEventListener("message", (e: MessageEvent<SpectrogramRequest>) => {
  const request = e.data;
  if (request.type === "start") {
    computer = createSpectrogramComputer(request.layout, request.sampleRate);
  } else if (request.type === "chunk") {
    computer?.computeFrames(request.samples, request.firstFrame, request.frameCount);
    const response: SpectrogramResponse = { type: "chunkDone" };
    self.postMessage(response);
  } else if (computer) {
    const data = computer.finish();
    const response: SpectrogramResponse = { type: "done", data };
    self.postMessage(response, { transfer: [data.levels.buffer] });
  }
});
