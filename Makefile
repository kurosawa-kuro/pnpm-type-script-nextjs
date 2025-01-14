# 開発用コマンド
dev:  # ローカル開発サーバー起動
	pnpm run dev

# ログファイルの監視
watch:
	tail -f logs/combined.log

# 環境セットアップ（シンプル化）
setup-env:
	chmod u+x ./infrastructure/setup.sh && ./infrastructure/setup.sh

# 依存関係のインストール
pnpm-install: install-pnpm
	pnpm install

# すべてのセットアップを実行
setup-app: setup-env pnpm-install
