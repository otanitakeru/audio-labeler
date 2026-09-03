from pydantic import BaseModel


class UploadedAudioInfo(BaseModel):
    upload_id: str
    filename: str
    duration_sec: float
    sample_rate: int
    channel_count: int
