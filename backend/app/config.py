import os
from pathlib import Path

# アップロードされた音声を一時的に保存する場所。バックエンド再起動時にクリアされる
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/tmp/audio-labeler-uploads"))
