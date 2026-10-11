from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.io.audio_io import AudioFileError, read_channel, uploaded_audio_path
from app.models import TranscribedText, TranscribeRequest, TranscriptionFailure, TranscriptionReady
from app.services.transcription import TranscriptionError, prepare_audio, transcribe_range

router = APIRouter(prefix="/api/transcription", tags=["transcription"])


# 1区間に十数秒かかるため、終わった区間から1行ずつ返し、フロントで進捗を出したりラベルに入れたりできるようにする(NDJSON)。
# 返し始めた後はステータスコードを変えられないため、モデルの読み込み失敗などはTranscriptionFailureの行で知らせる
@router.post("/uploads/{upload_id}")
def transcribe_segments(upload_id: str, request: TranscribeRequest, http_request: Request) -> StreamingResponse:
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

    # 推論はCPUを長く使うため、1区間ずつスレッドプールで実行する。
    # 利用者が中止して接続が切れたら、処理中の区間を終えたところで止める。接続切れは行を送ろうとするまで
    # Starlette側では気づかれず1区間余計に処理してしまうため、次の区間に進む前に自分で確かめる
    async def stream_results() -> AsyncIterator[str]:
        try:
            audio = await run_in_threadpool(prepare_audio, samples, sample_rate, request.model_id)
            # モデルの読み込みは初回のダウンロードを含め数分かかることがあるため、終わったことを知らせて表示を切り替えられるようにする
            yield TranscriptionReady().model_dump_json() + "\n"
            for index, r in enumerate(request.ranges):
                if await http_request.is_disconnected():
                    return
                text = await run_in_threadpool(transcribe_range, audio, r, request.model_id, request.language)
                yield TranscribedText(index=index, text=text).model_dump_json() + "\n"
        except TranscriptionError as e:
            yield TranscriptionFailure(error=str(e)).model_dump_json() + "\n"

    return StreamingResponse(stream_results(), media_type="application/x-ndjson")
