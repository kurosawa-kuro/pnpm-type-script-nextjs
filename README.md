# pnpm-type-script-nextjs

aws ecr create-repository --repository-name nextjs-app --region ap-northeast-1

# AWS ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージにECRのタグを付ける
docker tag nextjs-app:latest 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app:latest

# ECRにプッシュ
docker push 985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app:latest

nextjs-app-02-ecs-sg