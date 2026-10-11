from typing import Literal

from pydantic import BaseModel, Field, model_validator


class UploadedAudioInfo(BaseModel):
    upload_id: str
    filename: str
    duration_sec: float
    sample_rate: int
    channel_count: int
    # 量子化ビット数。μ-lawなど、ビット数で表せない形式ではNone
    bit_depth: int | None
    is_float: bool


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


# 自動検出の進み具合は1行ずつ返す(NDJSON)。各行は次のいずれかで、typeで見分ける
class SpeechDetectionProgress(BaseModel):
    """検出の進み具合。前処理(モデルの読み込み・リサンプリング)が終わり、判定を始めてから返す"""

    type: Literal["progress"] = "progress"
    # 0〜100
    percent: int
    # 前の行から後に見つかった、発話らしさがしきい値を超えた部分。途中経過を波形に出すためのもので、
    # 区間の切り出し(最短の発話・余白など)を当てはめる前の値なので、最後に返す区間とはずれる
    speech_ranges: list[DetectedSpeechSegment]


class SpeechDetectionResult(BaseModel):
    """検出が終わった。最後の行になる"""

    type: Literal["result"] = "result"
    segments: list[DetectedSpeechSegment]


class TranscriptionRange(BaseModel):
    start_sec: float = Field(ge=0)
    end_sec: float

    @model_validator(mode="after")
    def check_range(self) -> "TranscriptionRange":
        if self.end_sec <= self.start_sec:
            raise ValueError("end_sec must be greater than start_sec")
        return self


class TranscribeRequest(BaseModel):
    channel: int = Field(ge=0)
    # Hugging Face のモデルID(例: openai/whisper-large-v3-turbo)
    model_id: str = Field(min_length=1)
    # Whisperの言語コード(例: ja)。Noneのときは区間ごとに自動判定する
    language: str | None = Field(min_length=1)
    ranges: list[TranscriptionRange]


# 文字起こしの進み具合は1行ずつ返す(NDJSON)。各行は次のいずれかで、typeで見分ける
class TranscriptionReady(BaseModel):
    """モデルの読み込み(初回はダウンロードも)が終わり、区間の文字起こしを始めた"""

    type: Literal["ready"] = "ready"


class TranscribedText(BaseModel):
    """1区間の文字起こしが終わった"""

    type: Literal["result"] = "result"
    # リクエストのrangesの何番目の区間か
    index: int
    text: str


class TranscriptionFailure(BaseModel):
    """途中で失敗した。これを返したら、以降の区間は処理しない"""

    type: Literal["error"] = "error"
    # 利用者向けの文言
    error: str
