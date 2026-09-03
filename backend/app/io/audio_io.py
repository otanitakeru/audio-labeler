import io
from pathlib import Path

import numpy as np
import soundfile as sf


class AudioFileError(Exception):
    """音声ファイルの読み込み・処理でユーザー操作に起因しうるエラー"""


def get_audio_info(path: Path) -> tuple[float, int, int]:
    """(duration_sec, sample_rate, channel_count) を返す"""
    try:
        info = sf.info(str(path))
    except Exception as e:
        raise AudioFileError(f"音声ファイルを読み込めません: {path.name}") from e
    return info.duration, info.samplerate, info.channels


def extract_channel_as_wav_bytes(path: Path, channel_index: int) -> bytes:
    """指定したチャンネル1本だけを抽出したモノラルWAVのバイト列を返す"""
    try:
        data, samplerate = sf.read(str(path), always_2d=True)
    except Exception as e:
        raise AudioFileError(f"音声ファイルを読み込めません: {path.name}") from e

    channel_count = data.shape[1]
    if not (0 <= channel_index < channel_count):
        raise AudioFileError(
            f"チャンネル番号が不正です(0〜{channel_count - 1}の範囲で指定してください)"
        )

    mono = np.ascontiguousarray(data[:, channel_index])

    buffer = io.BytesIO()
    sf.write(buffer, mono, samplerate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()
