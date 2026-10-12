from fastapi import APIRouter, HTTPException, Response

from app.io.audio_io import AudioFileError, uploaded_audio_path
from app.models import SegmentExportRequest
from app.services.segment_export import build_segment_zip

router = APIRouter(prefix="/api/segment-export", tags=["segment-export"])


# 同期関数にしてFastAPIのスレッドプールで動かす(長い音声ではリサンプリングに数秒かかり、その間ほかのリクエストを止めないため)
@router.post("/uploads/{upload_id}")
def export_segments(upload_id: str, request: SegmentExportRequest) -> Response:
    path = uploaded_audio_path(upload_id)
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="アップロードした音声が見つかりません。もう一度ファイルを選択してください。",
        )

    try:
        zip_bytes = build_segment_zip(path, request)
    except AudioFileError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return Response(content=zip_bytes, media_type="application/zip")
