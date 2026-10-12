import io
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from app.config import UPLOAD_DIR


class AudioFileError(Exception):
    """音声ファイルの読み込み・処理でユーザー操作に起因しうるエラー"""


# チャンネルを抜き出すときに一度に読むサンプル数(48kHzで約20秒)。8chでも1回あたり数十MBに収まる
_READ_BLOCK_FRAMES = 1_000_000

# 読めなかったときの利用者向けの文言。保存先のファイル名はアップロード時に付けたIDで利用者には意味がないため含めない
_UNREADABLE_AUDIO_MESSAGE = "音声ファイルを読み込めません。WAV形式の音声ファイルか確認してください。"


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
        raise AudioFileError(_UNREADABLE_AUDIO_MESSAGE) from e
    bit_depth, is_float = _SUBTYPE_SAMPLE_FORMATS.get(info.subtype, (None, False))
    return AudioInfo(
        duration_sec=info.duration,
        sample_rate=info.samplerate,
        channel_count=info.channels,
        bit_depth=bit_depth,
        is_float=is_float,
    )


def read_channel(path: Path, channel_index: int, dtype: str = "float32") -> tuple[np.ndarray, int]:
    """指定したチャンネル1本だけを抽出したモノラル波形と、サンプリングレートを返す。
    dtypeが"float32"・"float64"なら-1〜1の値、"int16"なら16bit整数の値で返す。
    元がfloatの音声を"int16"で読むと値が拡大されず(0.5が0になる)、ほぼ無音になるため使わない"""
    with open_audio_file(path) as sound_file:
        channel_count = sound_file.channels
        if not (0 <= channel_index < channel_count):
            raise AudioFileError(
                f"チャンネル番号が不正です(0〜{channel_count - 1}の範囲で指定してください)"
            )
        # 全チャンネルを一度に読むと、長い多チャンネルの音声では使わないチャンネルの分までメモリを使う
        # (1時間・8ch・48kHzをfloat64で読むと約11GB)ため、少しずつ読んで指定のチャンネルだけを残す
        mono = np.empty(sound_file.frames, dtype=dtype)
        filled = 0
        for block in sound_file.blocks(_READ_BLOCK_FRAMES, dtype=dtype, always_2d=True):
            mono[filled : filled + len(block)] = block[:, channel_index]
            filled += len(block)
        # ヘッダーのサンプル数より実際のデータが短い(途中で切れた)ファイルでは、読めた分だけを返す
        return mono[:filled], sound_file.samplerate


def to_wav_bytes(samples: np.ndarray, sample_rate: int, subtype: str) -> bytes:
    """波形をWAVのバイト列にする。subtypeはsoundfileのサンプル形式(PCM_16など)"""
    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV", subtype=subtype)
    return buffer.getvalue()


def extract_channel_as_wav_bytes(path: Path, channel_index: int) -> bytes:
    """指定したチャンネル1本だけを抽出したモノラルWAVのバイト列を返す"""
    # 書き出しは16bitなので、整数の音声は最初から16bit整数で読む。float64で読んで変換し直すと、長い音声では1秒近く余計にかかるため。
    # floatの音声は16bit整数では正しく読めないため(read_channel参照)、floatで読み、-1〜1を超える値を切り詰めてから書き出す
    if get_audio_info(path).is_float:
        mono, samplerate = read_channel(path, channel_index, dtype="float32")
        return to_wav_bytes(np.clip(mono, -1.0, 1.0), samplerate, "PCM_16")
    mono, samplerate = read_channel(path, channel_index, dtype="int16")
    return to_wav_bytes(mono, samplerate, "PCM_16")


def open_audio_file(path: Path) -> sf.SoundFile:
    """範囲を指定して少しずつ読むために開く。全体を読み込むと、長い多チャンネルの音声ではメモリを多く使うため"""
    try:
        return sf.SoundFile(str(path))
    except Exception as e:
        raise AudioFileError(_UNREADABLE_AUDIO_MESSAGE) from e


def read_range(sound_file: sf.SoundFile, start_sec: float, end_sec: float) -> np.ndarray:
    """開いた音声の指定した範囲を、全チャンネルのまま(サンプル数, チャンネル数)の-1〜1の値で返す。
    範囲の端は最も近いサンプルに丸め、音声の長さを超える分は切り詰める"""
    start_frame = min(round(start_sec * sound_file.samplerate), sound_file.frames)
    end_frame = min(round(end_sec * sound_file.samplerate), sound_file.frames)
    sound_file.seek(start_frame)
    return sound_file.read(end_frame - start_frame, dtype="float64", always_2d=True)
