import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import UPLOAD_DIR
from app.routers import audio, vad


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
app.include_router(vad.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
