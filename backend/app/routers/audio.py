import uuid

from fastapi import APIRouter, File, HTTPException, Response, UploadFile

from app.config import UPLOAD_DIR
from app.io.audio_io import (
    AudioFileError,
    extract_channel_as_wav_bytes,
    get_audio_info,
    uploaded_audio_path,
)
from app.models import UploadedAudioInfo

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/uploads")
async def upload_audio_file(file: UploadFile = File(...)) -> UploadedAudioInfo:
    if not (file.filename or "").lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="WAV形式のファイルを選択してください")

    upload_id = uuid.uuid4().hex
    path = uploaded_audio_path(upload_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(await file.read())

    try:
        info = get_audio_info(path)
    except AudioFileError as e:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e)) from e

    return UploadedAudioInfo(
        upload_id=upload_id,
        filename=file.filename,
        duration_sec=info.duration_sec,
        sample_rate=info.sample_rate,
        channel_count=info.channel_count,
        bit_depth=info.bit_depth,
        is_float=info.is_float,
    )


@router.get("/uploads/{upload_id}")
def get_uploaded_audio(upload_id: str, channel: int = 0) -> Response:
    path = uploaded_audio_path(upload_id)
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="アップロードした音声が見つかりません。もう一度ファイルを選択してください。",
        )

    try:
        wav_bytes = extract_channel_as_wav_bytes(path, channel)
    except AudioFileError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return Response(content=wav_bytes, media_type="audio/wav")
