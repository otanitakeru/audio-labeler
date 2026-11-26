import shutil
from contextlib import asynccontextmanager
from importlib.util import find_spec

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import UPLOAD_DIR
from app.models import BackendFeatures
from app.routers import audio, segment_export

# 自動検出・文字起こしは、要るパッケージが入っているビルド(full)でだけ使える(PLAN.md 6章)。
# importの失敗で判断すると、fullでコードの誤りによるImportErrorまで「機能なし」に見えてしまうため、パッケージの有無で判断する
FEATURES = BackendFeatures(
    speech_detection=find_spec("silero_vad") is not None,
    transcription=find_spec("transformers") is not None,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if UPLOAD_DIR.exists():
        shutil.rmtree(UPLOAD_DIR)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(lifespan=lifespan)

# ローカルDocker環境での利用のみを想定し、オリジンを絞らず全許可する
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audio.router)
app.include_router(segment_export.router)
# ルーターのモジュールはtorchなどをimportするため、パッケージがあるときだけ読み込む
if FEATURES.speech_detection:
    from app.routers import vad

    app.include_router(vad.router)
if FEATURES.transcription:
    from app.routers import transcription

    app.include_router(transcription.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/features")
def features() -> BackendFeatures:
    return FEATURES
