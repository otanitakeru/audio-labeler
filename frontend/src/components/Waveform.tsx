import AmplitudeAxis from "./AmplitudeAxis";
import FrequencyAxis from "./FrequencyAxis";

type WaveformProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  amplitudeAxisRef: React.RefObject<HTMLDivElement | null>;
  peakAmplitude: number;
  mainWaveformHeight: number;
  minimapHeight: number;
  // メイン波形とラベル帯の間に出すスペクトログラムの縦幅。0なら出さない
  spectrogramHeight: number;
  spectrogramMaxFrequency: number;
  isSpectrogramComputing: boolean;
  // 自動検出・文字起こしの実行中。枠の色を進み具合のボタンと揃えてゆっくり変える
  isProcessing: boolean;
};

function Waveform({
  containerRef,
  amplitudeAxisRef,
  peakAmplitude,
  mainWaveformHeight,
  minimapHeight,
  spectrogramHeight,
  spectrogramMaxFrequency,
  isSpectrogramComputing,
  isProcessing,
}: WaveformProps) {
  const labelAreaTop = minimapHeight + mainWaveformHeight + spectrogramHeight;
  return (
    <div
      className={`flex min-h-25 gap-2 rounded-lg border border-gray-300 bg-white p-4 ${isProcessing ? "animate-border-pulse" : ""}`}
    >
      <div className="flex w-14 shrink-0 flex-col">
        <div style={{ height: minimapHeight }} />
        <AmplitudeAxis ref={amplitudeAxisRef} peakAmplitude={peakAmplitude} mainWaveformHeight={mainWaveformHeight} />
        {spectrogramHeight > 0 && <FrequencyAxis maxFrequency={spectrogramMaxFrequency} height={spectrogramHeight} />}
      </div>
      <div className="relative min-w-0 flex-1">
        <div ref={containerRef} />
        {/* 波形とラベル領域(波形の下にuseWavesurfer側で確保している余白)の境界線。ラベルが無い区間にも常に表示するため、
            区間(Region)側のcontentとは別に、波形コンテナ全体を覆う独立した線として引く。pointer-eventsは無効化しドラッグ選択を妨げないようにする */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-gray-300"
          style={{ top: labelAreaTop }}
        />
        {isSpectrogramComputing && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center gap-2 text-sm text-gray-500"
            style={{ top: minimapHeight + mainWaveformHeight, height: spectrogramHeight }}
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            スペクトログラムを計算中...
          </div>
        )}
      </div>
    </div>
  );
}

export default Waveform;
