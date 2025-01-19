#!/bin/bash

# スクリプトの実行ディレクトリに関係なく、プロジェクトルートの README.md を参照するように修正
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# README.md に改行を追加
echo "" >> "$PROJECT_ROOT/README.md"

# 成功のコミット with timestamp
git add .
git commit -m "success commit $(date)"
git push
