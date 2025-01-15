# 開発用コマンド
dev:  # ローカル開発サーバー起動
	cd fullstack-nextjs && pnpm run dev

# ログファイルの監視
watch:
	tail -f logs/combined.log

# 環境セットアップ（シンプル化）
setup-env:
	chmod u+x ./infrastructure/setup-env.sh
	sudo ./infrastructure/setup-env.sh

# 環境セットアップ（シンプル化）
setup-app:
	chmod u+x ./infrastructure/setup-app.sh
	sudo ./infrastructure/setup-app.sh

# /home/ec2-user/app/infrastructure/fargate-deploy.sh
fargate-deploy:
	./infrastructure/fargate-deploy.sh

# CloudWatchのログを直接確認
cloudwatch-log:
	aws logs tail /ecs/nextjs-app-02 --log-stream-name "ecs/nextjs-app/[TASK-ID]" --follow