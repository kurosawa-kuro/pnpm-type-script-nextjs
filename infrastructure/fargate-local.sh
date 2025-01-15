#!/bin/bash

# 基本設定
REGION="ap-northeast-1"
ACCOUNT_ID="985539793438"
REPOSITORY_NAME="nextjs-app"
IMAGE_TAG="latest"
DOCKERFILE_PATH="./fullstack-nextjs"

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

# ... existing deployment code ...

# コンテナの実行
echo "ローカルでコンテナを実行中..."
docker run -d \
    -p 3000:3000 \
    --name nextjs-local \
    ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG}

# コンテナの状態確認
echo "コンテナの状態を確認中..."
docker ps | grep nextjs-local

echo "セットアップが完了しました！"
echo "アプリケーションは http://localhost:3000 でアクセス可能です"