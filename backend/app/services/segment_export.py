import io
import zipfile
from pathlib import Path

import numpy as np
import torch
from torchaudio.functional import resample

from app.io.audio_io import AudioFileError, open_audio_file, read_range, to_wav_bytes
from app.models import ExportSampleFormat, SegmentExportRequest

_SAMPLE_FORMAT_SUBTYPES: dict[ExportSampleFormat, str] = {
    "pcm16": "PCM_16",
    "pcm24": "PCM_24",
    "float32": "FLOAT",
}


def _resample(samples: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    # torchaudioは(チャンネル数, サンプル数)で受け取るため、向きを入れ替えて渡す。
    # float64のまま変換し、元が32bitのときに精度を落とさないようにする
    resampled = resample(torch.from_numpy(np.ascontiguousarray(samples.T)), from_rate, to_rate)
    return resampled.numpy().T


def build_segment_zip(path: Path, request: SegmentExportRequest) -> bytes:
    """区間ごとに切り出したwavと、フロントで作ったテキストを1つのZIPにまとめる(PLAN.md 5章)"""
    with open_audio_file(path) as sound_file:
        source_rate = sound_file.samplerate
        if request.channel is not None and request.channel >= sound_file.channels:
            raise AudioFileError(
                f"チャンネル番号が不正です(0〜{sound_file.channels - 1}の範囲で指定してください)"
            )
        if request.sample_rate is not None and request.sample_rate > source_rate:
            raise AudioFileError("サンプリング周波数は元の音声以下にしてください")
        output_rate = request.sample_rate or source_rate
        subtype = (
            _SAMPLE_FORMAT_SUBTYPES[request.sample_format]
            if request.sample_format is not None
            else sound_file.subtype
        )
        is_float = subtype in ("FLOAT", "DOUBLE")

        folder = request.folder_name
        buffer = io.BytesIO()
        # wavはほとんど縮まないため圧縮しない(圧縮しても時間がかかるだけ)
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zip_file:
            for clip in request.clips:
                samples = read_range(sound_file, clip.start_sec, clip.end_sec)
                if request.channel is not None:
                    samples = samples[:, [request.channel]]
                if output_rate != source_rate:
                    samples = _resample(samples, source_rate, output_rate)
                # 整数のサンプル形式では-1〜1を超える値が折り返して大きな雑音になるため切り詰める
                # (リサンプリングでわずかに超えることがあるほか、元がfloatの音声は超えた値を持てる)
                if not is_float:
                    samples = np.clip(samples, -1.0, 1.0)
                zip_file.writestr(f"{folder}/wav/{clip.name}.wav", to_wav_bytes(samples, output_rate, subtype))
            for name, content in request.text_files.items():
                zip_file.writestr(f"{folder}/{name}", content)
        return buffer.getvalue()
