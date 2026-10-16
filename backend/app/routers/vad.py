import asyncio
import threading
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.io.audio_io import AudioFileError, read_channel, uploaded_audio_path
from app.models import DetectedSpeechSegment, DetectSpeechRequest, SpeechDetectionProgress, SpeechDetectionResult
from app.services.vad import detect_speech

router = APIRouter(prefix="/api/vad", tags=["vad"])

# 進み具合を確かめて送る間隔。Silero VADは数十msごとに進み具合を知らせてくるため、そのつど送らずに間引く
_PROGRESS_INTERVAL_SEC = 0.2


# 長い音声では数十秒かかるため、進み具合を1行ずつ返し、フロントで進捗を出せるようにする(NDJSON)。
# 利用者が中止して接続が切れたら、検出を途中でやめる
@router.post("/uploads/{upload_id}")
def detect_speech_segments(upload_id: str, request: DetectSpeechRequest, http_request: Request) -> StreamingResponse:
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

    async def stream_progress() -> AsyncIterator[str]:
        cancelled = threading.Event()
        # 検出を実行するスレッドが書き込み、こちらは一定間隔で読むだけなので排他しない。
        # 前処理(モデルの読み込み・リサンプリング)の間はNoneのままにし、進み具合の行を送らない。
        # フロントは最初の進み具合が届くまでを前処理中として表示する
        percent: int | None = None
        # 同じく検出のスレッドが末尾に足していくだけで、こちらは送っていない分を読むだけなので排他しない
        speech_ranges: list[DetectedSpeechSegment] = []

        def on_progress(p: int) -> None:
            nonlocal percent
            percent = p

        def on_speech_found(start_sec: float, end_sec: float) -> None:
            speech_ranges.append(DetectedSpeechSegment(start_sec=start_sec, end_sec=end_sec))

        # 推論はCPUを長く使うため、スレッドプールで実行し、その間に進み具合を送る
        task = asyncio.ensure_future(
            run_in_threadpool(
                detect_speech,
                samples,
                sample_rate,
                request.params,
                request.range,
                on_progress,
                on_speech_found,
                cancelled,
            )
        )
        try:
            sent_percent: int | None = None
            sent_range_count = 0
            while not task.done():
                await asyncio.wait({task}, timeout=_PROGRESS_INTERVAL_SEC)
                if await http_request.is_disconnected():
                    return
                range_count = len(speech_ranges)
                if percent is not None and (percent != sent_percent or range_count != sent_range_count):
                    progress = SpeechDetectionProgress(
                        percent=percent, speech_ranges=speech_ranges[sent_range_count:range_count]
                    )
                    sent_percent, sent_range_count = percent, range_count
                    yield progress.model_dump_json() + "\n"
            segments = [DetectedSpeechSegment(start_sec=start, end_sec=end) for start, end in task.result()]
            yield SpeechDetectionResult(segments=segments).model_dump_json() + "\n"
        finally:
            # 途中で抜けたとき(接続切れなど)は検出をやめさせる。やめたときの例外(SpeechDetectionCancelled)は
            # 誰も受け取らないため、未処理の例外として警告が出ないよう取り出しておく
            if not task.done():
                cancelled.set()
                task.add_done_callback(lambda t: t.exception())

    return StreamingResponse(stream_progress(), media_type="application/x-ndjson")
