import io
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from app.config import UPLOAD_DIR


class AudioFileError(Exception):
    """音声ファイルの読み込み・処理でユーザー操作に起因しうるエラー"""


def uploaded_audio_path(upload_id: str) -> Path:
    return UPLOAD_DIR / f"{upload_id}.wav"


@dataclass(frozen=True)
class AudioInfo:
    duration_sec: float
    sample_rate: int
    channel_count: int
    # 量子化ビット数。μ-lawなど、ビット数で表せない形式ではNone
    bit_depth: int | None
    is_float: bool


# soundfileのsubtype(WAVのサンプル形式)から、(ビット数, 浮動小数点か)への対応
_SUBTYPE_SAMPLE_FORMATS: dict[str, tuple[int, bool]] = {
    "PCM_U8": (8, False),
    "PCM_S8": (8, False),
    "PCM_16": (16, False),
    "PCM_24": (24, False),
    "PCM_32": (32, False),
    "FLOAT": (32, True),
    "DOUBLE": (64, True),
}


def get_audio_info(path: Path) -> AudioInfo:
    try:
        info = sf.info(str(path))
    except Exception as e:
        raise AudioFileError(f"音声ファイルを読み込めません: {path.name}") from e
    bit_depth, is_float = _SUBTYPE_SAMPLE_FORMATS.get(info.subtype, (None, False))
    return AudioInfo(
        duration_sec=info.duration,
        sample_rate=info.samplerate,
        channel_count=info.channels,
        bit_depth=bit_depth,
        is_float=is_float,
    )


def read_channel(path: Path, channel_index: int, dtype: str = "float64") -> tuple[np.ndarray, int]:
    """指定したチャンネル1本だけを抽出したモノラル波形と、サンプリングレートを返す。
    dtypeが"float64"なら-1〜1の値、"int16"なら16bit整数の値で返す"""
    try:
        data, samplerate = sf.read(str(path), always_2d=True, dtype=dtype)
    except Exception as e:
        raise AudioFileError(f"音声ファイルを読み込めません: {path.name}") from e

    channel_count = data.shape[1]
    if not (0 <= channel_index < channel_count):
        raise AudioFileError(
            f"チャンネル番号が不正です(0〜{channel_count - 1}の範囲で指定してください)"
        )
    return np.ascontiguousarray(data[:, channel_index]), samplerate


def extract_channel_as_wav_bytes(path: Path, channel_index: int) -> bytes:
    """指定したチャンネル1本だけを抽出したモノラルWAVのバイト列を返す"""
    # 書き出しは16bitなので、最初から16bit整数で読む。float64で読んで変換し直すと、長い音声では1秒近く余計にかかるため
    mono, samplerate = read_channel(path, channel_index, dtype="int16")
    buffer = io.BytesIO()
    sf.write(buffer, mono, samplerate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()
