#!/bin/bash

# 基本設定
REGION="ap-northeast-1"
ACCOUNT_ID="985539793438"
REPOSITORY_NAME="nextjs-app"
IMAGE_TAG="latest"

echo "ローカル環境のクリーンアップを開始します..."

# 実行中のコンテナを確認して停止
if docker ps -q --filter "name=nextjs-local" | grep -q .; then
    echo "実行中のnextjs-localコンテナを停止中..."
    docker stop nextjs-local || {
        echo "警告: コンテナの停止に失敗しました"
    }
fi

# 停止したコンテナを削除
if docker ps -aq --filter "name=nextjs-local" | grep -q .; then
    echo "nextjs-localコンテナを削除中..."
    docker rm nextjs-local || {
        echo "警告: コンテナの削除に失敗しました"
    }
fi

# ECRイメージをローカルから削除（ECRリポジトリのイメージは維持されます）
echo "ローカルにキャッシュされたECRイメージを削除中..."
docker rmi ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG} || {
    echo "警告: ローカルのECRイメージの削除に失敗しました"
}

# ローカルイメージを削除
echo "ローカルのDockerイメージを削除中..."
docker rmi ${REPOSITORY_NAME}:${IMAGE_TAG} || {
    echo "警告: ローカルイメージの削除に失敗しました"
}

# 未使用のイメージ、コンテナ、ネットワークをクリーンアップ
echo "未使用のDockerリソースをクリーンアップ中..."
docker system prune -f

echo "クリーンアップが完了しました！"