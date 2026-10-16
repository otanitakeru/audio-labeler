import threading
from collections.abc import Callable

import numpy as np
import torch
from silero_vad import get_speech_timestamps, load_silero_vad
from torchaudio.functional import resample

from app.models import SpeechDetectionRange, VadParams

_model = None
# モデルは推論のたびに内部状態をリセットして使うため、同時に複数のリクエストから使われないよう排他する
_model_lock = threading.Lock()


class SpeechDetectionCancelled(Exception):
    """呼び出し側が中止を求めたため、検出を途中でやめた"""


def _get_model():
    # 読み込みに数秒かかるため、最初に使うときに一度だけ読み込む
    global _model
    if _model is None:
        _model = load_silero_vad()
    return _model


class _ProbabilityRecorder:
    """get_speech_timestampsに渡すモデルの代わりに使い、窓ごとの発話らしさを控えておく。
    get_speech_timestampsは判定の途中の値を返さないため、モデルを包んで受け取る
    (get_speech_timestampsはモデルをreset_statesと呼び出しにしか使わない)"""

    def __init__(self, model) -> None:
        self._model = model
        self.latest_probability = 0.0

    def reset_states(self) -> None:
        self._model.reset_states()

    def __call__(self, chunk: torch.Tensor, sampling_rate: int) -> torch.Tensor:
        probability = self._model(chunk, sampling_rate)
        self.latest_probability = probability.item()
        return probability


def detect_speech(
    samples: np.ndarray,
    sample_rate: int,
    params: VadParams,
    detection_range: SpeechDetectionRange | None,
    on_progress: Callable[[int], None],
    on_speech_found: Callable[[float, float], None],
    cancelled: threading.Event,
) -> list[tuple[float, float]]:
    """モノラル波形から発話区間を検出し、(開始秒, 終了秒)の一覧を返す。
    detection_rangeを渡すとその範囲の中だけを検出する(秒は範囲の中でも元の音声の位置で返す)。
    途中経過として、進み具合(0〜100%)をon_progressで、判定済みの範囲で発話らしさがしきい値を超えた部分(開始秒, 終了秒)を
    on_speech_foundで知らせる。後者は区間の切り出し(最短の発話・余白など)を当てはめる前の値なので、戻り値の区間とはずれる。
    cancelledが立ったらSpeechDetectionCancelledを投げて途中でやめる"""
    # 返す秒に足す位置と、返す区間の上限(範囲の中での秒)
    offset_sec = 0.0
    duration_sec = len(samples) / sample_rate
    if detection_range is not None:
        # スライスはコピーを作らない(numpyのview)
        samples = samples[int(detection_range.start_sec * sample_rate) : int(detection_range.end_sec * sample_rate)]
        # サンプル位置への丸めで範囲のわずかに外の時刻にならないよう、範囲の秒をそのまま基準にする
        # (隣の区間とぴったり接していると、外にはみ出した分だけ重なってしまうため)
        offset_sec = detection_range.start_sec
        duration_sec = detection_range.end_sec - detection_range.start_sec
    # Silero VADは8kHzか16kHzの音声しか受け付けないため、指定されたレートへリサンプリングしてから渡す
    vad_sample_rate = params.sampling_rate
    # 既にfloat32なら(read_channelの既定)、長い音声で全体のコピーを作らないようにそのまま使う
    wav = torch.from_numpy(samples.astype(np.float32, copy=False))
    if sample_rate != vad_sample_rate:
        wav = resample(wav, sample_rate, vad_sample_rate)
    vad_duration_sec = len(wav) / vad_sample_rate

    with _model_lock:
        recorder = _ProbabilityRecorder(_get_model())
        # 判定済みの位置と、しきい値を超え始めた位置(超えていなければNone)
        judged_until_sec = 0.0
        speech_start_sec: float | None = None

        # Silero VADは窓(数十ms)を1つ判定するたびに、その窓の終わりまでの割合を渡してこのコールバックを呼ぶ。
        # get_speech_timestampsには途中で止める手段がないため、中止はここで例外を投げて抜ける
        # (モデルの内部状態は次の呼び出しの最初にリセットされるので、途中でやめても影響しない)
        def track_progress(percent: float) -> None:
            nonlocal judged_until_sec, speech_start_sec
            if cancelled.is_set():
                raise SpeechDetectionCancelled
            window_start_sec = judged_until_sec
            judged_until_sec = percent / 100 * vad_duration_sec
            is_speech = recorder.latest_probability >= params.threshold
            if is_speech and speech_start_sec is None:
                speech_start_sec = window_start_sec
            elif not is_speech and speech_start_sec is not None:
                on_speech_found(offset_sec + speech_start_sec, offset_sec + window_start_sec)
                speech_start_sec = None
            on_progress(int(percent))

        # return_seconds=Trueは秒を小数1桁に丸めてしまうため、サンプル位置で受け取って自前で秒に直す
        timestamps = get_speech_timestamps(
            wav,
            recorder,
            sampling_rate=vad_sample_rate,
            threshold=params.threshold,
            neg_threshold=params.neg_threshold,
            min_speech_duration_ms=params.min_speech_duration_ms,
            max_speech_duration_s=params.max_speech_duration_s or float("inf"),
            min_silence_duration_ms=params.min_silence_duration_ms,
            speech_pad_ms=params.speech_pad_ms,
            min_silence_at_max_speech=params.min_silence_at_max_speech,
            use_max_poss_sil_at_max_speech=params.use_max_poss_sil_at_max_speech,
            progress_tracking_callback=track_progress,
        )
    # リサンプリング後のサンプル数の丸めで、末尾の区間が元の音声(範囲)の長さをわずかに超えることがあるため切り詰める
    segments = [
        (offset_sec + t["start"] / vad_sample_rate, offset_sec + min(t["end"] / vad_sample_rate, duration_sec))
        for t in timestamps
    ]
    return _merge_close_segments(segments, params.min_silence_duration_ms_after_vad / 1000)


def _merge_close_segments(segments: list[tuple[float, float]], max_gap_sec: float) -> list[tuple[float, float]]:
    """間の無音がmax_gap_secより短い隣り合う区間をつなげる。
    Silero VADのmin_silence_duration_msは前後の余白を足す前の無音で判定するため、余白を足したあとの間隔で
    まとめたいときに使う(speech-splitter-with-vadのmin_silence_duration_ms_after_vadと同じ処理)"""
    merged: list[tuple[float, float]] = []
    for start, end in segments:
        if merged and start - merged[-1][1] < max_gap_sec:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))
    return merged
