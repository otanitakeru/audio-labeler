# base: 自動検出・文字起こしなし / full: 自動検出・文字起こしまで使える(PLAN.md 6章)
# 依存の段階(deps-*)とアプリの段階を分け、アプリのコードを変えても依存を入れ直さないようにする

FROM python:3.11-slim AS deps-base
COPY --from=ghcr.io/astral-sh/uv:0.13.10 /uv /bin/uv
WORKDIR /app
COPY requirements.txt .
RUN uv pip install --system --no-cache --compile-bytecode -r requirements.txt

# deps-base の上に積み、後から full に切り替えても追加分だけをインストールする
FROM deps-base AS deps-full
COPY requirements-ml.txt .
RUN uv pip install --system --no-cache --compile-bytecode --torch-backend cpu -r requirements-ml.txt

FROM deps-base AS base
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM deps-full AS full
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
