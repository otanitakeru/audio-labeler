#!/bin/bash
set -e
cd "$(dirname "$0")"

# コンテナは消さずに止める。止めたあとも ./start.sh や Docker Desktop の再生ボタンで同じコンテナを起動できるようにするため
docker compose stop
