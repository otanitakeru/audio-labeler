import threading
from dataclasses import dataclass

import numpy as np
import torch
from torchaudio.functional import resample
from transformers import pipeline
from transformers.pipelines import AutomaticSpeechRecognitionPipeline

from app.models import TranscriptionRange


class TranscriptionError(Exception):
    """文字起こしでユーザー操作(設定したモデルID・言語)に起因しうるエラー"""


# モデルは1GB前後あり読み込みにも時間がかかるため、最後に使った1つだけをメモリに置いておく
_loaded: tuple[str, AutomaticSpeechRecognitionPipeline] | None = None
# モデルの入れ替えや同時の推論でメモリを使いすぎないよう、モデルの読み込み・推論は排他する。
# 呼び出し側が途中でやめた(利用者が中止した)ときにロックが残らないよう、ロックは1回の呼び出しの間だけ持つ
_lock = threading.Lock()


@dataclass(frozen=True)
class PreparedAudio:
    """モデルが受け付けるサンプリングレートに変換したモノラル波形"""

    samples: np.ndarray
    sample_rate: int


def _get_pipeline(model_id: str) -> AutomaticSpeechRecognitionPipeline:
    global _loaded
    if _loaded is None or _loaded[0] != model_id:
        # 先に参照を外し、2つ目のモデルを読み込む間に前のモデルとメモリを二重に使わないようにする
        _loaded = None
        try:
            asr = pipeline("automatic-speech-recognition", model=model_id, device="cpu", dtype=torch.float32)
        except (OSError, ValueError) as e:
            raise TranscriptionError(
                f"モデル「{model_id}」を読み込めません。設定のモデルIDと、ネットワークにつながっているかを確認してください。"
            ) from e
        _loaded = (model_id, asr)
    return _loaded[1]


def prepare_audio(samples: np.ndarray, sample_rate: int, model_id: str) -> PreparedAudio:
    """モデルを読み込み(初回はダウンロードも)、波形をモデルのサンプリングレートに変換する。
    Whisperは16kHzの音声しか受け付けないため、区間ごとではなく全体を一度だけ変換してから切り出して使う"""
    with _lock:
        model_sample_rate: int = _get_pipeline(model_id).feature_extractor.sampling_rate
    # 既にfloat32なら(read_channelの既定)、長い音声で全体のコピーを作らないようにそのまま使う
    wav = torch.from_numpy(samples.astype(np.float32, copy=False))
    if sample_rate != model_sample_rate:
        wav = resample(wav, sample_rate, model_sample_rate)
    return PreparedAudio(samples=wav.numpy(), sample_rate=model_sample_rate)


def transcribe_range(audio: PreparedAudio, r: TranscriptionRange, model_id: str, language: str | None) -> str:
    """1区間を文字起こしする。languageがNoneのときは区間ごとに言語を自動判定する"""
    clip = audio.samples[int(r.start_sec * audio.sample_rate) : int(r.end_sec * audio.sample_rate)]
    if len(clip) == 0:
        return ""
    generate_kwargs = {"language": language} if language is not None else {}
    with _lock:
        asr = _get_pipeline(model_id)
        # Whisperが一度に扱える長さ(30秒)を超える区間は、タイムスタンプを予測させないと書き起こせない(transformersの仕様)。
        # 短い区間でタイムスタンプを予測させると何も出さないことがあるため、超えるときだけ有効にする
        max_input_sec: float = asr.feature_extractor.chunk_length
        try:
            result = asr(
                {"raw": clip, "sampling_rate": audio.sample_rate},
                generate_kwargs=generate_kwargs,
                return_timestamps=r.end_sec - r.start_sec > max_input_sec,
            )
        except ValueError as e:
            # 想定しているのは、Whisperが対応していない言語コードを指定したとき
            raise TranscriptionError(
                f"言語「{language}」で文字起こしできません。設定の言語コード(例: ja, en)を確認してください。"
            ) from e
    return result["text"].strip()
