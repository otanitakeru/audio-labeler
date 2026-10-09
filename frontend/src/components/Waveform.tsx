import AmplitudeAxis from "./AmplitudeAxis";

type WaveformProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  amplitudeAxisRef: React.RefObject<HTMLDivElement | null>;
  peakAmplitude: number;
  mainWaveformHeight: number;
  minimapHeight: number;
};

function Waveform({ containerRef, amplitudeAxisRef, peakAmplitude, mainWaveformHeight, minimapHeight }: WaveformProps) {
  return (
    <div className="flex min-h-25 gap-2 rounded-lg border border-gray-300 bg-white p-4">
      <AmplitudeAxis
        ref={amplitudeAxisRef}
        peakAmplitude={peakAmplitude}
        mainWaveformHeight={mainWaveformHeight}
        minimapHeight={minimapHeight}
      />
      <div className="relative min-w-0 flex-1">
        <div ref={containerRef} />
        {/* 波形とラベル領域(波形の下にuseWavesurfer側で確保している余白)の境界線。ラベルが無い区間にも常に表示するため、
            区間(Region)側のcontentとは別に、波形コンテナ全体を覆う独立した線として引く。pointer-eventsは無効化しドラッグ選択を妨げないようにする */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-gray-300"
          style={{ top: minimapHeight + mainWaveformHeight }}
        />
      </div>
    </div>
  );
}

export default Waveform;
