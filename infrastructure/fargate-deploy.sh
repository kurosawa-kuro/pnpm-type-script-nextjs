#!/bin/bash

# 変数定義
REGION="ap-northeast-1"
ACCOUNT_ID="985539793438"
REPOSITORY_NAME="nextjs-app"
IMAGE_TAG="latest"
DOCKERFILE_PATH="./fullstack-nextjs"
# 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app

# Dockerサービスの自動起動設定
echo "Configuring Docker service..."
sudo systemctl enable docker || {
    echo "Error: Failed to enable Docker service"
    exit 1
}

# ユーザーをdockerグループに追加し、現在のシェルに適用
echo "Adding current user to docker group..."
sudo usermod -a -G docker $USER || {
    echo "Error: Failed to add user to docker group"
    exit 1
}

# 変数をエクスポートして、サブシェルでも利用可能にする
export REGION
export ACCOUNT_ID
export REPOSITORY_NAME
export IMAGE_TAG
export DOCKERFILE_PATH

# 現在のシェルセッションにdockerグループを一時的に追加
exec sg docker -c "
# Dockerデーモンへの接続確認
if ! docker info > /dev/null 2>&1; then
    echo \"Error: Unable to connect to Docker daemon\"
    exit 1
fi

# Dockerfileの存在確認
if [ ! -f \"\${DOCKERFILE_PATH}/Dockerfile\" ]; then
    echo \"Error: Dockerfile not found at \${DOCKERFILE_PATH}/Dockerfile\"
    exit 1
fi

# Dockerイメージのビルド
echo \"Building Docker image...\"
docker build -t \${REPOSITORY_NAME}:\${IMAGE_TAG} \${DOCKERFILE_PATH} || exit 1

# リポジトリ作成（存在しない場合のみ）
if ! aws ecr describe-repositories --repository-names \${REPOSITORY_NAME} --region \${REGION} > /dev/null 2>&1; then
    echo \"Creating ECR repository: \${REPOSITORY_NAME}\"
    aws ecr create-repository --repository-name \${REPOSITORY_NAME} --region \${REGION} || exit 1
else
    echo \"Repository \${REPOSITORY_NAME} already exists, skipping creation...\"
fi

# AWS ECRにログイン
echo \"Logging in to ECR...\"
aws ecr get-login-password --region \${REGION} | docker login --username AWS --password-stdin \${ACCOUNT_ID}.dkr.ecr.\${REGION}.amazonaws.com || exit 1

# イメージにECRのタグを付ける
echo \"Tagging docker image...\"
docker tag \${REPOSITORY_NAME}:\${IMAGE_TAG} \${ACCOUNT_ID}.dkr.ecr.\${REGION}.amazonaws.com/\${REPOSITORY_NAME}:\${IMAGE_TAG} || exit 1

# ECRにプッシュ
echo \"Pushing image to ECR...\"
docker push \${ACCOUNT_ID}.dkr.ecr.\${REGION}.amazonaws.com/\${REPOSITORY_NAME}:\${IMAGE_TAG} || exit 1

echo \"Deployment completed successfully!\"
"