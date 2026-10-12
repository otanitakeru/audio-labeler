import shutil
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


# 受け取ったファイルは一時ファイルになっているため、全体をメモリに読まず少しずつ保存先へ写す。
# 写す間のファイル操作でほかのリクエストを止めないよう、同期関数にしてFastAPIのスレッドプールで動かす
@router.post("/uploads")
def upload_audio_file(file: UploadFile = File(...)) -> UploadedAudioInfo:
    if not (file.filename or "").lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="WAV形式のファイルを選択してください")

    upload_id = uuid.uuid4().hex
    path = uploaded_audio_path(upload_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as saved:
        shutil.copyfileobj(file.file, saved)

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


# 使わなくなった音声(別の音声に切り替えた・読み込みのダイアログでキャンセルした)をフロントから消してもらう(PLAN.md 4章-1)。
# 既に無いとき(バックエンドの再起動で消えた後など)も、消したい状態にはなっているので成功として返す
@router.delete("/uploads/{upload_id}", status_code=204)
def delete_uploaded_audio(upload_id: str) -> None:
    uploaded_audio_path(upload_id).unlink(missing_ok=True)
