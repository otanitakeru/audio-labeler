#!/bin/bash
set -e
cd "$(dirname "$0")"

docker compose up --build -d

echo ""
echo "起動しました"
echo "  frontend: http://localhost:5173"
echo "  backend:  http://localhost:8000"
