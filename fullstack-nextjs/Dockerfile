# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# 必要なパッケージをインストール
RUN apk add --no-cache openssl

# pnpmのインストール
RUN corepack enable && corepack prepare pnpm@latest --activate

# 全ファイルをコピー
COPY . .

# 依存関係のインストール
RUN pnpm install --frozen-lockfile

# Prismaの生成とビルド
RUN npx prisma generate && pnpm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 必要なパッケージをインストール
RUN apk add --no-cache openssl

# pnpmのインストール
RUN corepack enable && corepack prepare pnpm@latest --activate

# アプリケーションファイルのコピー
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/prisma ./prisma

# 本番環境の依存関係のインストール
RUN pnpm install --prod --frozen-lockfile

# Prisma Clientの生成
RUN npx prisma generate

# ビルド済みファイルのコピー
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["pnpm", "run", "start"] 