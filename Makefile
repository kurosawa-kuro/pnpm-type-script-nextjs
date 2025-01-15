# 開発用コマンド
dev:  # ローカル開発サーバー起動
	pnpm run dev

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

# 依存関係のインストール
pnpm-install: install-pnpm
	pnpm install

# /home/ec2-user/app/infrastructure/fargate-deploy.sh
fargate-deploy:
	./infrastructure/fargate-deploy.sh
