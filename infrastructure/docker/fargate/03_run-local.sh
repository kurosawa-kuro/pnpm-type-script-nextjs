#!/bin/bash

# 基本設定
REGION="ap-northeast-1"
ACCOUNT_ID="985539793438"
REPOSITORY_NAME="nextjs-app"
IMAGE_TAG="latest"
DOCKERFILE_PATH="./fullstack-nextjs"

# エラーハンドリングの設定
set -e
trap 'echo "エラーが発生しました。スクリプトを終了します。"; exit 1' ERR

# システム情報の確認
echo "システム情報を確認中..."
node -v
pnpm -v

# CloudWatch Agentの状態確認
if [ -f "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl" ]; then
    echo "CloudWatch Agentの状態を確認中..."
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
else
    echo "警告: CloudWatch Agentがインストールされていません"
fi

# 既存のコンテナの確認と削除
echo "既存のコンテナを確認中..."
if docker ps -a | grep -q nextjs-local; then
    echo "既存のnextjs-localコンテナを停止・削除中..."
    docker stop nextjs-local >/dev/null 2>&1 || true
    docker rm nextjs-local >/dev/null 2>&1 || true
fi

# コンテナの実行
echo "ローカルでコンテナを実行中..."
docker run -d \
    -p 3000:3000 \
    --name nextjs-local \
    ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG}

# ヘルスチェックの追加
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