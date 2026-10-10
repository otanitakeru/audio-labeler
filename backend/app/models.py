from typing import Literal

from pydantic import BaseModel, Field, model_validator


class UploadedAudioInfo(BaseModel):
    upload_id: str
    filename: str
    duration_sec: float
    sample_rate: int
    channel_count: int


class VadParams(BaseModel):
    """Silero VADの検出パラメータ(意味はsilero_vad.get_speech_timestampsの同名引数と同じ)"""

    # モデルに渡す音声のサンプリングレート。Silero VADは8kHzと16kHzに対応している
    sampling_rate: Literal[8000, 16000]
    threshold: float = Field(gt=0, lt=1)
    # Noneのときはsilero_vadの既定(threshold - 0.15)
    neg_threshold: float | None = Field(gt=0, lt=1)
    min_speech_duration_ms: int = Field(ge=0)
    # Noneのときは無制限
    max_speech_duration_s: float | None = Field(gt=0)
    min_silence_duration_ms: int = Field(ge=0)
    speech_pad_ms: int = Field(ge=0)
    min_silence_at_max_speech: int = Field(ge=0)
    use_max_poss_sil_at_max_speech: bool
    # 以下はSilero VADの引数ではなく、このアプリ独自の後処理。
    # 前後の余白(speech_pad_ms)を足したあとの区間同士の間がこれより短ければつなげる。0なら結合しない
    min_silence_duration_ms_after_vad: int = Field(ge=0)

    @model_validator(mode="after")
    def check_neg_threshold(self) -> "VadParams":
        # 発話の終わりの判定が始まりの判定より厳しいと、発話の判定が細切れになるため。等しいのは許す
        if self.neg_threshold is not None and self.neg_threshold > self.threshold:
            raise ValueError("neg_threshold must be less than or equal to threshold")
        return self


class DetectSpeechRequest(BaseModel):
    channel: int = Field(ge=0)
    params: VadParams


class DetectedSpeechSegment(BaseModel):
    start_sec: float
    end_sec: float
