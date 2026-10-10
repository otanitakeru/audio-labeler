from fastapi import APIRouter, HTTPException

from app.io.audio_io import AudioFileError, read_channel, uploaded_audio_path
from app.models import DetectedSpeechSegment, DetectSpeechRequest
from app.services.vad import detect_speech

router = APIRouter(prefix="/api/vad", tags=["vad"])


# 推論はCPUを長く使うため、async defにせずスレッドプールで実行させる
@router.post("/uploads/{upload_id}")
def detect_speech_segments(upload_id: str, request: DetectSpeechRequest) -> list[DetectedSpeechSegment]:
    path = uploaded_audio_path(upload_id)
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="アップロードした音声が見つかりません。もう一度ファイルを選択してください。",
        )

    try:
        samples, sample_rate = read_channel(path, request.channel)
    except AudioFileError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return [
        DetectedSpeechSegment(start_sec=start_sec, end_sec=end_sec)
        for start_sec, end_sec in detect_speech(samples, sample_rate, request.params)
    ]
