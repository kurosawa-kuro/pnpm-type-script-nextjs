# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# pnpmのインストール
RUN corepack enable && corepack prepare pnpm@latest --activate

# pnpm-lock.yamlとpackage.jsonをコピー
COPY pnpm-lock.yaml package.json ./

# 依存関係のインストール
RUN pnpm install --frozen-lockfile

# ソースコードをコピー
COPY . .

# ビルド
RUN pnpm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

# pnpmのインストール
RUN corepack enable && corepack prepare pnpm@latest --activate

# package.jsonとpnpm-lock.yamlをコピー
COPY package.json pnpm-lock.yaml ./

# 本番環境の依存関係のみをインストール
RUN pnpm install --prod --frozen-lockfile

# ビルド済みのファイルをコピー
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["pnpm", "run", "start"] 