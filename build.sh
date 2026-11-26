#!/bin/bash
set -e
cd "$(dirname "$0")"

# イメージを作り、コンテナを作り直して起動する(PLAN.md 6章)。
# --base: 自動検出・文字起こしなし / --full: あり / --gpu: ありで、NVIDIA GPU で動かす。
# 選んだ値は .env に残し、省いたときは前回の値(なければ full)で作る
case "${1:-}" in
  --base) target=base ;;
  --full) target=full ;;
  --gpu) target=gpu ;;
  "") target="" ;;
  *)
    echo "使い方: ./build.sh [--base | --full | --gpu]" >&2
    exit 1
    ;;
esac

if [ -n "$target" ]; then
  # .env にほかの値があっても消さないよう、このスクリプトが書く行だけを書き換える
  touch .env
  grep -v -e '^BACKEND_TARGET=' -e '^COMPOSE_FILE=' .env > .env.tmp || true
  echo "BACKEND_TARGET=$target" >> .env.tmp
  if [ "$target" = "gpu" ]; then
    # GPU をコンテナに渡す設定と、PyTorch の CUDA 版を選ぶ引数を重ねる
    echo "COMPOSE_FILE=docker-compose.yml:docker-compose.gpu.yml" >> .env.tmp
  fi
  mv .env.tmp .env
fi

current=$(grep '^BACKEND_TARGET=' .env 2>/dev/null | cut -d= -f2)
current=${current:-full}

if [ "$current" = "gpu" ]; then
  # ビルドのキャッシュはドライバーの版を知らないため、版を渡してドライバーを更新したら PyTorch を選び直させる。
  # .env には書かない(更新のたびに書き換えずに済むよう、毎回ホストから読む)
  NVIDIA_DRIVER_VERSION=$(cat /sys/module/nvidia/version 2>/dev/null || true)
  export NVIDIA_DRIVER_VERSION
fi

# stop.sh はコンテナを消さないため、作り直したコンテナに前のフロントの node_modules(無名ボリューム)が引き継がれる。
# package.json を変えたときに古いままにならないよう、無名ボリュームも作り直す
docker compose up -d --build --renew-anon-volumes

echo ""
echo "作り直して起動しました"
echo "  frontend: http://localhost:5173"
echo "  backend:  http://localhost:8000"
case "$current" in
  base) echo "  自動検出・文字起こし: なし(使うときは ./build.sh --full か --gpu)" ;;
  gpu)
    echo "  自動検出・文字起こし: あり"
    # 判定できずに CPU 版の PyTorch が入ったときも、ドライバーが古くて CUDA 版が動かないときも止めずに CPU で動くため、
    # 毎回目に入るここで GPU を使えるかを知らせる(PLAN.md 6章)。出力は「gpu か cpu」と「CUDA の版(CPU 版なら none)」
    status=$(docker compose exec -T backend python -c \
      "import torch; print('gpu' if torch.cuda.is_available() else 'cpu', torch.version.cuda or 'none')" 2>/dev/null || true)
    cuda=${status#* }
    case "$status" in
      gpu\ *) echo "  文字起こし: GPU で動きます(PyTorch: CUDA $cuda 版)" ;;
      "cpu none") echo "  文字起こし: GPU を使えないため、CPU で動きます(PyTorch: CPU 版。NVIDIA ドライバーを見つけられませんでした)" ;;
      cpu\ *) echo "  文字起こし: GPU を使えないため、CPU で動きます(PyTorch: CUDA $cuda 版。NVIDIA ドライバーの版がこの CUDA に対応しているか確かめてください)" ;;
      *) echo "  文字起こし: GPU を使えるか確かめられませんでした(docker compose logs backend でバックエンドのログを見てください)" ;;
    esac
    ;;
  *) echo "  自動検出・文字起こし: あり(入れないときは ./build.sh --base)" ;;
esac
