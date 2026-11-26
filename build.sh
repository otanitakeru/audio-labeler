#!/bin/bash
set -e
cd "$(dirname "$0")"

# イメージを作り、コンテナを作り直して起動する(PLAN.md 6章)。
# --base: 自動検出・文字起こしなし / --full: あり。選んだ値は .env に残し、省いたときは前回の値(なければ full)で作る
case "${1:-}" in
  --base) target=base ;;
  --full) target=full ;;
  "") target="" ;;
  *)
    echo "使い方: ./build.sh [--base | --full]" >&2
    exit 1
    ;;
esac

if [ -n "$target" ]; then
  # .env にほかの値があっても消さないよう、BACKEND_TARGET の行だけを書き換える
  touch .env
  grep -v '^BACKEND_TARGET=' .env > .env.tmp || true
  echo "BACKEND_TARGET=$target" >> .env.tmp
  mv .env.tmp .env
fi

# stop.sh はコンテナを消さないため、作り直したコンテナに前のフロントの node_modules(無名ボリューム)が引き継がれる。
# package.json を変えたときに古いままにならないよう、無名ボリュームも作り直す
docker compose up -d --build --renew-anon-volumes

current=$(grep '^BACKEND_TARGET=' .env 2>/dev/null | cut -d= -f2)
current=${current:-full}

echo ""
echo "作り直して起動しました"
echo "  frontend: http://localhost:5173"
echo "  backend:  http://localhost:8000"
if [ "$current" = "base" ]; then
  echo "  自動検出・文字起こし: なし(使うときは ./build.sh --full)"
else
  echo "  自動検出・文字起こし: あり(入れないときは ./build.sh --base)"
fi
