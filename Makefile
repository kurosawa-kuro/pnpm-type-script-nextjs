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
	chmod u+x ./infrastructure/fargate-deploy.sh
	./infrastructure/fargate-deploy.sh

fargate-local:
	chmod u+x ./infrastructure/fargate-local.sh
	./infrastructure/fargate-local.sh

fargate-local-destroy:
	chmod u+x ./infrastructure/fargate-local-destroy.sh
	./infrastructure/fargate-local-destroy.sh

docker-local:
	chmod u+x ./infrastructure/docker-local.sh
	./infrastructure/docker-local.sh


# CloudWatchのログを直接確認
cloudwatch-log:
	aws logs tail /ecs/nextjs-app-02 --log-stream-name "ecs/nextjs-app/[TASK-ID]" --follow


# Git tag with timestamp
tag-success:
	$(eval TIMESTAMP := $(shell date '+%Y%m%d_%H%M%S'))
	git tag -a "release_$(TIMESTAMP)" -m "Release deployed at $(TIMESTAMP)"
	git push origin "release_$(TIMESTAMP)"
	@echo "Created and pushed tag: release_$(TIMESTAMP)"

# Git tag index
tag-index:
	git tag -l
