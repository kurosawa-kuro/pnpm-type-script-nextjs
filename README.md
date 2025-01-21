# pnpm-type-script-nextjs

aws ecr create-repository --repository-name nextjs-app --region ap-northeast-1

# AWS ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージにECRのタグを付ける
docker tag nextjs-app:latest 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app:latest

# ECRにプッシュ
docker push 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app:latest

nextjs-app-02-ecs-sg

# CloudWatchのログを直接確認
aws logs tail /ecs/nextjs-app-02 --follow

# 特定のログストリームを確認
aws logs tail /ecs/nextjs-app-02 --log-stream-name "ecs/nextjs-app/[TASK-ID]" --follow

検証環境整備してPDCAサイクルを高速化


その為にScript Makefileをフル活用


# 1. 現状のスタック情報確認
cdk bootstrap --force aws://985539793438/ap-northeast-1

cdk deploy --require-approval never

cdk diff && cdk destroy --force && cdk deploy --require-approval never
















