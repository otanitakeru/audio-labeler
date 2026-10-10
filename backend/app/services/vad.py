import threading

import numpy as np
import torch
from silero_vad import get_speech_timestamps, load_silero_vad
from torchaudio.functional import resample

from app.models import VadParams

_model = None
# モデルは推論のたびに内部状態をリセットして使うため、同時に複数のリクエストから使われないよう排他する
_model_lock = threading.Lock()


def _get_model():
    # 読み込みに数秒かかるため、最初に使うときに一度だけ読み込む
    global _model
    if _model is None:
        _model = load_silero_vad()
    return _model


def detect_speech(samples: np.ndarray, sample_rate: int, params: VadParams) -> list[tuple[float, float]]:
    """モノラル波形から発話区間を検出し、(開始秒, 終了秒)の一覧を返す"""
    # Silero VADは8kHzか16kHzの音声しか受け付けないため、指定されたレートへリサンプリングしてから渡す
    vad_sample_rate = params.sampling_rate
    wav = torch.from_numpy(samples.astype(np.float32))
    if sample_rate != vad_sample_rate:
        wav = resample(wav, sample_rate, vad_sample_rate)

    with _model_lock:
        # return_seconds=Trueは秒を小数1桁に丸めてしまうため、サンプル位置で受け取って自前で秒に直す
        timestamps = get_speech_timestamps(
            wav,
            _get_model(),
            sampling_rate=vad_sample_rate,
            threshold=params.threshold,
            neg_threshold=params.neg_threshold,
            min_speech_duration_ms=params.min_speech_duration_ms,
            max_speech_duration_s=params.max_speech_duration_s or float("inf"),
            min_silence_duration_ms=params.min_silence_duration_ms,
            speech_pad_ms=params.speech_pad_ms,
            min_silence_at_max_speech=params.min_silence_at_max_speech,
            use_max_poss_sil_at_max_speech=params.use_max_poss_sil_at_max_speech,
        )
    # リサンプリング後のサンプル数の丸めで、末尾の区間が元の音声の長さをわずかに超えることがあるため切り詰める
    duration_sec = len(samples) / sample_rate
    segments = [(t["start"] / vad_sample_rate, min(t["end"] / vad_sample_rate, duration_sec)) for t in timestamps]
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
