#!/bin/bash

# カラー定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ログ出力関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# セクション区切り
print_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Node.jsとnpmの削除セクション
print_section "Removing existing Node.js and npm"

if command -v npm &> /dev/null || command -v node &> /dev/null; then
    log_info "Removing existing Node.js and npm installations..."
    if command -v sudo &> /dev/null; then
        sudo dnf remove -y nodejs npm
        sudo rm -rf /usr/lib/node_modules
        sudo rm -rf /usr/local/lib/node_modules
    else
        dnf remove -y nodejs npm
        rm -rf /usr/lib/node_modules
        rm -rf /usr/local/lib/node_modules
    fi
    
    # ユーザー固有のNode.js関連ファイルの削除
    rm -rf ~/.npm
    rm -rf ~/.node-gyp
    rm -rf ~/.node_repl_history
    
    log_success "Existing Node.js and npm removed successfully"
else
    log_info "No existing Node.js or npm installation found"
fi

# Node.jsの新規インストール
print_section "Installing Node.js"

log_info "Adding Node.js repository..."
if command -v sudo &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
fi

# PNPMのセットアップ
print_section "Setting up PNPM"

# PNPMが既にインストールされているか確認
if ! command -v pnpm &> /dev/null; then
    log_info "Installing PNPM using curl..."
    curl -fsSL https://get.pnpm.io/install.sh | bash -

    # PNPMパスの設定と即時反映
    log_info "Configuring PNPM path..."
    export PNPM_HOME="$HOME/.local/share/pnpm"
    case ":$PATH:" in
      *":$PNPM_HOME:"*) ;;
      *) export PATH="$PNPM_HOME:$PATH" ;;
    esac

    # 環境変数の永続化（まだ設定されていない場合のみ）
    if ! grep -q "PNPM_HOME" ~/.bashrc; then
        echo 'export PNPM_HOME="$HOME/.local/share/pnpm"' >> ~/.bashrc
        echo 'case ":$PATH:" in' >> ~/.bashrc
        echo '  *":$PNPM_HOME:"*) ;;' >> ~/.bashrc
        echo '  *) export PATH="$PNPM_HOME:$PATH" ;;' >> ~/.bashrc
        echo 'esac' >> ~/.bashrc
    fi

    # 新しい環境変数を現在のシェルに反映
    source ~/.bashrc
else
    log_info "PNPM is already installed"
fi

# PNPMのインストール確認
if ! command -v pnpm &> /dev/null; then
    log_error "PNPM installation failed"
    exit 1
fi

log_success "PNPM setup completed"

# パッケージマネージャーの検出
print_section "Detecting Package Manager"

if command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
    log_success "DNF package manager detected"
elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
    log_success "YUM package manager detected"
else
    log_error "Neither dnf nor yum found. Cannot install CloudWatch Agent."
    exit 1
fi

# CloudWatch Agentのインストール
print_section "Installing CloudWatch Agent"

if command -v sudo >/dev/null 2>&1; then
    log_info "Installing with sudo..."
    sudo $PKG_MANAGER install -y amazon-cloudwatch-agent
else
    log_info "Installing without sudo (as root)..."
    $PKG_MANAGER install -y amazon-cloudwatch-agent
fi

# CloudWatch Agent設定
print_section "Configuring CloudWatch Agent"

# 設定ファイルの配置を確実に
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_FILE="$SCRIPT_DIR/cloudwatch-config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    log_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

log_info "Creating configuration directory..."
if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
    sudo cp "$CONFIG_FILE" /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
    
    log_info "Configuring and starting CloudWatch Agent..."
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
    sudo systemctl enable amazon-cloudwatch-agent
    sudo systemctl restart amazon-cloudwatch-agent
else
    mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
    cp "$CONFIG_FILE" /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
    
    log_info "Configuring and starting CloudWatch Agent..."
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
    systemctl enable amazon-cloudwatch-agent
    systemctl restart amazon-cloudwatch-agent
fi

# 設定が正しく適用されるまで少し待機
sleep 5

log_success "CloudWatch Agent configuration completed"

# 最終確認
print_section "Verification"
log_info "Node.js Version:"
node -v || (log_error "Failed to get Node.js version" && exit 1)

log_info "PNPM Version:"
pnpm -v || (log_error "Failed to get PNPM version" && exit 1)

log_info "CloudWatch Agent Status:"
if command -v sudo >/dev/null 2>&1; then
    # ステータス確認のエラーを無視
    sudo systemctl is-active amazon-cloudwatch-agent >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        sudo systemctl status amazon-cloudwatch-agent
        log_success "CloudWatch Agent is running properly"
    else
        log_error "CloudWatch Agent is not running"
        exit 1
    fi
else
    systemctl is-active amazon-cloudwatch-agent >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        systemctl status amazon-cloudwatch-agent
        log_success "CloudWatch Agent is running properly"
    else
        log_error "CloudWatch Agent is not running"
        exit 1
    fi
fi

log_success "Setup completed successfully"
exit 0