#!/bin/bash

# 基本設定
REGION="ap-northeast-1"
ACCOUNT_ID="985539793438"
REPOSITORY_NAME="nextjs-app"
IMAGE_TAG="latest"
PROJECT_ROOT="$(pwd)"
NEXTJS_DIR="${PROJECT_ROOT}/fullstack-nextjs"
DOCKERFILE_PATH="${NEXTJS_DIR}"

# エラーハンドリングの設定
set -e
trap 'echo "エラーが発生しました。スクリプトを終了します。"; exit 1' ERR

# 権限の確認と修正
echo "node_modulesの権限を確認・修正中..."
if [ -d "${NEXTJS_DIR}/node_modules" ]; then
    sudo chown -R $(whoami):$(whoami) "${NEXTJS_DIR}/node_modules"
    sudo chmod -R 755 "${NEXTJS_DIR}/node_modules"
fi

# 必要なファイルの存在確認
echo "必要なファイルの存在を確認中..."
required_files=(
    "${NEXTJS_DIR}/package.json"
    "${NEXTJS_DIR}/pnpm-lock.yaml"
)
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "エラー: $file が見つかりません。"
        exit 1
    fi
done

# 必要なツールの確認
command -v docker >/dev/null 2>&1 || { echo "Dockerがインストールされていません。インストールしてください。"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpmがインストールされていません。インストールしてください。"; exit 1; }

# pnpm lockファイルの更新
echo "依存関係を更新中..."
cd ${NEXTJS_DIR}
pnpm install --no-frozen-lockfile

# 既存のコンテナの確認と削除
echo "既存のコンテナを確認中..."
if docker ps -a | grep -q nextjs-prod; then
    echo "既存のnextjs-prodコンテナを停止・削除中..."
    docker stop nextjs-prod >/dev/null 2>&1 || true
    docker rm nextjs-prod >/dev/null 2>&1 || true
fi

# イメージのビルド
echo "本番用Dockerイメージをビルド中..."
docker build -t ${REPOSITORY_NAME}:${IMAGE_TAG} \
    --build-arg NODE_ENV=production \
    --no-cache .

# コンテナの実行
echo "ローカルで本番用コンテナを実行中..."
docker run -d \
    -p 3000:3000 \
    --name nextjs-prod \
    -e NODE_ENV=production \
    ${REPOSITORY_NAME}:${IMAGE_TAG}

# コンテナの状態確認
echo "コンテナの状態を確認中..."
docker ps | grep nextjs-prod

# ヘルスチェック
echo "アプリケーションの起動を待機中..."
for i in {1..30}; do
    if curl -s http://localhost:3000 >/dev/null; then
        echo "アプリケーションが正常に起動しました！"
        echo "アプリケーションは http://localhost:3000 でアクセス可能です"
        exit 0
    fi
    echo "待機中... ($i/30)"
    sleep 1
done

echo "エラー: アプリケーションの起動がタイムアウトしました"
exit 1