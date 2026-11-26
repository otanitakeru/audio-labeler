#!/bin/bash
set -e
cd "$(dirname "$0")"

# 作ってあるコンテナをそのまま起動する(Docker Desktop の再生ボタンと同じ)。イメージは作り直さない(PLAN.md 6章)。
# まだコンテナもイメージもないときだけ、.env の種類(なければ full)で作ってから起動する
docker compose up -d

echo ""
echo "起動しました"
echo "  frontend: http://localhost:5173"
echo "  backend:  http://localhost:8000"
echo "  依存や種類を変えるときは ./build.sh(--base / --full)"
