#!/bin/bash

# デバッグモードを有効化
# set -x

# touch setup.sh && chmod u+x setup.sh && vi setup.sh

#=========================================
# 設定と定数
#=========================================
# インストール設定
declare -A INSTALL_FLAGS=(
    [SYSTEM_UPDATES]=false
    [DEV_TOOLS]=false
    [AWS_CLI]=false
    [ANSIBLE]=false
    [DOCKER]=true
    [NODEJS]=true
    [CDK]=true
    [GO]=false
    [CLOUDWATCH_AGENT]=false
    [SWAP]=false
    [POSTGRESQL]=false
)

# データベース設定
declare -A DB_CONFIG=(
    [DB]=training_develop
    [USER]=postgres
    [PASSWORD]=postgres
)

# グローバル定数
readonly SWAP_SIZE="4096"
readonly DOCKER_COMPOSE_VERSION="v2.21.0"
readonly GO_VERSION="1.22.0"

# インストール情報保持用
declare -A INSTALL_INFO

#=========================================
# 基本ユーティリティ
#=========================================
# エラーハンドリングの設定を調整
set -uo pipefail
# set -e は削除（エラー時に即座に終了するのを防ぐ）

trap 'error_handler $? $LINENO $BASH_LINENO "$BASH_COMMAND" $(printf "::%s" ${FUNCNAME[@]:-})' ERR

log() { 
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    # デバッグ情報も出力
    [[ "${DEBUG:-false}" = true ]] && echo "[DEBUG] Called from: ${FUNCNAME[1]:-main}"
}

error_handler() {
    local exit_code=$1
    local line_number=$2
    local bash_lineno=$3
    local last_command=$4
    local func_stack=$5

    # 正常終了の場合はエラーハンドリングをスキップ
    if [[ $exit_code -eq 0 ]]; then
        return 0
    fi

    # デバッグ情報の出力
    if [[ "${DEBUG:-false}" = true ]]; then
        log "Error occurred in ${func_stack} at line ${line_number}"
        log "Last command: ${last_command}"
        log "Exit code: ${exit_code}"
    fi

    # スタックトレースの出力（重大なエラー時のみ）
    if [[ $exit_code -gt 1 ]]; then
        local frame=0
        while caller $frame; do
            ((frame++))
        done 2>/dev/null
    fi
}

check_command() { command -v "$1" &>/dev/null; }

#=========================================
# システム設定
#=========================================
setup_swap() {
    local swap_file="/swapfile"
    log "Setting up swap file..."
    [[ "$EUID" -ne 0 ]] && { log "Error: Root privileges required"; return 1; }

    if [[ -f "$swap_file" ]]; then
        swapoff "$swap_file" 2>/dev/null || true
        rm "$swap_file"
    fi

    dd if=/dev/zero of="$swap_file" bs=1M count="$SWAP_SIZE" status=progress
    chmod 600 "$swap_file"
    mkswap "$swap_file"
    swapon "$swap_file"
    grep -q "$swap_file" /etc/fstab || echo "$swap_file none swap sw 0 0" >> /etc/fstab
}

#=========================================
# 開発ツール
#=========================================
install_dev_tools() {
    log "Installing development tools..."
    ! dnf group list installed "Development Tools" &>/dev/null && \
        dnf groupinstall "Development Tools" -y

    local packages=("git" "make" "jq" "which" "python3-pip" "python3-devel" "libffi-devel" "openssl-devel")
    for pkg in "${packages[@]}"; do
        ! rpm -q "$pkg" &>/dev/null && dnf install -y "$pkg"
    done
}

#=========================================
# PostgreSQL
#=========================================
install_postgresql() {
    check_command psql && { log "PostgreSQL is already installed"; return 0; }

    log "Installing PostgreSQL..."
    dnf install -y postgresql15-server
    [[ ! -d "/var/lib/pgsql/data/base" ]] && {
        postgresql-setup --initdb
        configure_postgresql
    }
    systemctl enable postgresql
    systemctl start postgresql
    setup_postgresql_db
}

configure_postgresql() {
    local pg_hba_conf="/var/lib/pgsql/data/pg_hba.conf"
    local postgresql_conf="/var/lib/pgsql/data/postgresql.conf"

    sudo -u postgres bash -c "
        sed -i \"s/#listen_addresses = 'localhost'/listen_addresses = '*'/\" $postgresql_conf
        cp $pg_hba_conf ${pg_hba_conf}.bak
        sed -i 's/ident/md5/g' $pg_hba_conf
        echo 'host    all    all    0.0.0.0/0    md5' >> $pg_hba_conf
    "
    chown postgres:postgres $pg_hba_conf ${pg_hba_conf}.bak $postgresql_conf
    chmod 600 $pg_hba_conf ${pg_hba_conf}.bak $postgresql_conf
}

setup_postgresql_db() {
    cd /var/lib/pgsql
    sudo -u postgres bash -c "
        psql -c \"ALTER USER postgres WITH PASSWORD '${DB_CONFIG[PASSWORD]}';\"
        createdb ${DB_CONFIG[DB]}
        createdb ${DB_CONFIG[DB]}_test
    "
}

#=========================================
# Docker
#=========================================
install_docker() {
    check_command docker && { log "Docker is already installed"; return 0; }

    log "Installing Docker..."
    dnf install -y docker
    systemctl enable docker
    systemctl start docker

    if ! check_command docker-compose; then
        log "Installing Docker Compose..."
        curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
            -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi

    ! groups ec2-user | grep -q docker && usermod -a -G docker ec2-user

    INSTALL_INFO[DOCKER]=$(cat << EOF
Docker情報:
- Docker Version: $(docker --version)
- Docker Compose Version: $(docker-compose --version)
- Docker Service: $(systemctl is-active docker)
- Docker Socket: /var/run/docker.sock
- Docker Group: docker (ec2-user added)
- 注意: 新しいシェルを開くとdockerコマンドがsudoなしで実行可能になります
EOF
)
}

#=========================================
# NodeJS
#=========================================
install_nodejs() {
    log "Installing Node.js..."
    
    # Node.jsのインストール
    if ! check_command node; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        dnf install -y nodejs
    fi

    # pnpmのインストール
    if ! check_command pnpm; then
        log "Installing pnpm..."
        npm install -g pnpm
        
        # pnpmのグローバルディレクトリ設定
        mkdir -p /usr/local/share/pnpm
        mkdir -p /usr/local/bin
        
        # 環境変数の設定
        export PNPM_HOME="/usr/local/share/pnpm"
        export PATH="/usr/local/bin:$PNPM_HOME:$PATH"
        
        # システム全体の環境変数設定
        cat > /etc/profile.d/pnpm.sh << 'EOL'
export PNPM_HOME="/usr/local/share/pnpm"
export PATH="/usr/local/bin:$PNPM_HOME:$PATH"
EOL
        chmod 644 /etc/profile.d/pnpm.sh
        
        # pnpmの初期設定
        pnpm config set global-dir "/usr/local/share/pnpm"
        pnpm config set global-bin-dir "/usr/local/bin"
    fi
    
    # AWS CDKのインストール
    if [[ "${INSTALL_FLAGS[CDK]}" == "true" ]] && ! check_command cdk; then
        log "Installing AWS CDK..."
        # 環境変数を確実に設定
        export PNPM_HOME="/usr/local/share/pnpm"
        export PATH="/usr/local/bin:$PNPM_HOME:$PATH"
        
        # 既存のシンボリックリンクを削除
        rm -f /usr/local/bin/cdk
        
        # CDKのインストール
        pnpm install -g aws-cdk
        
        # CDKのバイナリを探して、シンボリックリンクを作成
        local cdk_paths=(
            "/usr/local/share/pnpm/global/5/.pnpm/aws-cdk@*/node_modules/aws-cdk/bin/cdk"
            "/usr/local/share/pnpm/global/5/node_modules/.bin/cdk"
            "$(find /usr/local/share/pnpm/global -name cdk -type f | grep '/bin/cdk$' | head -n1)"
        )
        
        local cdk_bin=""
        for path in "${cdk_paths[@]}"; do
            if [[ -f "$(eval echo $path)" ]]; then
                cdk_bin="$(eval echo $path)"
                break
            fi
        done
        
        if [[ -n "$cdk_bin" ]]; then
            log "Found CDK binary at: $cdk_bin"
            ln -sf "$cdk_bin" /usr/local/bin/cdk
            chmod +x "$cdk_bin"
            chmod +x /usr/local/bin/cdk
            
            # 確認
            if [[ -x /usr/local/bin/cdk ]]; then
                log "CDK symlink created successfully"
            else
                log "Warning: Failed to create executable CDK symlink"
            fi
        else
            log "Error: Could not find CDK binary"
            return 1
        fi
        
        # PATHを通す
        if ! grep -q "/usr/local/bin" /etc/profile.d/pnpm.sh; then
            echo 'export PATH="/usr/local/bin:$PATH"' >> /etc/profile.d/pnpm.sh
        fi
    fi
    
    # 環境変数を反映
    source /etc/profile.d/pnpm.sh
    
    # バージョン確認
    log "Node.js version: $(node -v)"
    log "pnpm version: $(pnpm -v)"
    log "AWS CDK version: $(cdk --version 2>/dev/null || echo 'Not installed')"
    
    # Node.js関連の情報を保存
    INSTALL_INFO[NODEJS]=$(cat << EOF
Node.js情報:
- Node.js バージョン: $(node -v)
- pnpm バージョン: $(pnpm -v)
- AWS CDK バージョン: $(cdk --version 2>/dev/null || echo 'Not installed')
- インストール場所:
  - Node.js: $(which node)
  - pnpm: $(which pnpm)
  - CDK: $(which cdk 2>/dev/null || echo 'Not installed')
EOF
)
}

# プロファイル設定を追加
setup_nodejs_profile() {
    cat > /etc/profile.d/nodejs.sh << 'EOL'
# Node.js環境設定
export PATH="/usr/local/bin:$PATH"
EOL
    chmod 644 /etc/profile.d/nodejs.sh
}

#=========================================
# Go
#=========================================
install_go() {
    check_command go && { log "Go is already installed"; return 0; }

    log "Installing Go language..."
    local go_archive="go${GO_VERSION}.linux-amd64.tar.gz"
    
    rm -rf /usr/local/go
    curl -LO "https://go.dev/dl/${go_archive}"
    tar -C /usr/local -xzf "${go_archive}"
    rm "${go_archive}"
    
    setup_go_environment
}

setup_go_environment() {
    # システム全体の設定
    cat > /etc/profile.d/go.sh << 'EOL'
export GOROOT=/usr/local/go
export GOPATH=$HOME/go
export PATH=$PATH:$GOROOT/bin:$GOPATH/bin
EOL
    chmod 644 /etc/profile.d/go.sh

    # ユーザー設定
    ! grep -q "GOROOT" /home/ec2-user/.bashrc && {
        cat >> /home/ec2-user/.bashrc << 'EOL'
export GOROOT=/usr/local/go
export GOPATH=$HOME/go
export PATH=$PATH:$GOROOT/bin:$GOPATH/bin
EOL
    }

    # 権限設定
    chown -R root:root /usr/local/go
    mkdir -p /home/ec2-user/go
    chown -R ec2-user:ec2-user /home/ec2-user/go
}

#=========================================
# CloudWatch Agent
#=========================================
install_cloudwatch_agent() {
    local config_target="/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"
    
    log "Installing CloudWatch Agent..."
    
    # インストール済みチェック
    if check_command amazon-cloudwatch-agent-ctl; then
        log "CloudWatch Agent is already installed"
        create_cloudwatch_config "$config_target"
        return 0
    fi

    # インストール処理
    dnf install -y amazon-cloudwatch-agent || {
        log "Failed to install CloudWatch Agent"
        return 1
    }

    create_cloudwatch_config "$config_target"
    
    # 設定完了後のメッセージを追加
    log "CloudWatch Agent setup completed successfully"
    log "Service status: $(systemctl is-active amazon-cloudwatch-agent)"
}

create_cloudwatch_config() {
    local config_target="$1"
    
    cat > "$config_target" << 'EOL'
{
  "agent": {
    "run_as_user": "root",
    "debug": true
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/app/logs/combined.log",
            "log_group_name": "/app/combined-logs",
            "log_stream_name": "{instance_id}",
            "timestamp_format": "%Y-%m-%dT%H:%M:%S.%fZ",
            "multi_line_start_pattern": "{",
            "encoding": "utf-8",
            "retention_in_days": 14
          }
        ]
      }
    },
    "force_flush_interval": 5
  }
}
EOL

    # ログディレクトリとファイルの作成・権限設定
    mkdir -p /home/ec2-user/app/logs
    touch /home/ec2-user/app/logs/combined.log
    chown -R ec2-user:ec2-user /home/ec2-user/app/logs
    chmod 755 /home/ec2-user/app/logs
    chmod 644 /home/ec2-user/app/logs/combined.log

    # CloudWatch Agent設定ディレクトリの権限設定
    mkdir -p /opt/aws/amazon-cloudwatch-agent/logs/state
    chown -R root:root /opt/aws/amazon-cloudwatch-agent/logs
    chmod -R 755 /opt/aws/amazon-cloudwatch-agent/logs
}

#=========================================
# バージョン確認
#=========================================
check_installed_versions() {
    local commands=(
        "git:${INSTALL_FLAGS[DEV_TOOLS]}"
        "make:${INSTALL_FLAGS[DEV_TOOLS]}"
        "docker:${INSTALL_FLAGS[DOCKER]}"
        "docker-compose:${INSTALL_FLAGS[DOCKER]}"
        "node:${INSTALL_FLAGS[NODEJS]}"
        "pnpm:${INSTALL_FLAGS[NODEJS]}"
        "cdk:${INSTALL_FLAGS[CDK]}"
        "psql:${INSTALL_FLAGS[POSTGRESQL]}"
    )

    for cmd_pair in "${commands[@]}"; do
        IFS=: read -r cmd flag <<< "$cmd_pair"
        [[ "$flag" = true ]] && check_command "$cmd" && {
            case "$cmd" in
                git) log "Git version: $(git --version)" ;;
                make) log "Make version: $(make --version | head -n1)" ;;
                docker) log "Docker version: $(docker --version)" ;;
                docker-compose) log "Docker Compose version: $(docker-compose --version)" ;;
                node) 
                    log "Node version: $(node -v)"
                    log "pnpm version: $(pnpm -v)"
                    log "AWS CDK version: $(cdk --version)"
                ;;
                psql) log "PostgreSQL version: $(psql --version)" ;;
            esac
        }
    done
}

#=========================================
# メイン処理
#=========================================
main() {
    log "Beginning setup..."
    
    # CDKが必要な場合は、Node.jsも必要
    if [[ "${INSTALL_FLAGS[CDK]}" == "true" ]]; then
        INSTALL_FLAGS[NODEJS]=true
    fi
    
    # デバッグ用：フラグの状態を確認
    for key in "${!INSTALL_FLAGS[@]}"; do
        log "Flag $key: ${INSTALL_FLAGS[$key]}"
    done
    
    # 各インストール処理
    if [[ "${INSTALL_FLAGS[SWAP]}" == "true" ]]; then
        log "Setting up SWAP..."
        setup_swap || log "SWAP setup failed"
    fi

    if [[ "${INSTALL_FLAGS[DEV_TOOLS]}" == "true" ]]; then
        log "Installing development tools..."
        install_dev_tools || log "Dev tools installation failed"
    fi

    if [[ "${INSTALL_FLAGS[POSTGRESQL]}" == "true" ]]; then
        log "Installing PostgreSQL..."
        install_postgresql || log "PostgreSQL installation failed"
    fi

    if [[ "${INSTALL_FLAGS[DOCKER]}" == "true" ]]; then
        log "Installing Docker..."
        install_docker || log "Docker installation failed"
    fi

    if [[ "${INSTALL_FLAGS[NODEJS]}" == "true" ]]; then
        log "Installing Node.js..."
        install_nodejs || log "Node.js installation failed"
    fi

    if [[ "${INSTALL_FLAGS[GO]}" == "true" ]]; then
        log "Installing Go..."
        install_go || log "Go installation failed"
    fi

    if [[ "${INSTALL_FLAGS[CLOUDWATCH_AGENT]}" == "true" ]]; then
        log "Installing CloudWatch Agent..."
        install_cloudwatch_agent || log "CloudWatch Agent installation failed"
    fi

    # インストール結果の表示
    log "Installation complete. Checking versions..."
    check_installed_versions || true

    # 最終サマリーの表示
    display_summary

    log "Setup completed successfully"
    return 0
}

#=========================================
# サマリー表示関数
#=========================================
display_summary() {
    log "============================================"
    log "インストール完了サマリー"
    log "============================================"
    
    # INSTALL_INFOの内容を表示
    for key in "${!INSTALL_INFO[@]}"; do
        if [[ -n "${INSTALL_INFO[$key]}" ]]; then
            log "${INSTALL_INFO[$key]}"
            log "--------------------------------------------"
        fi
    done
    
    # 注意事項の表示
    log "注意事項:"
    log "1. 各コンポーネントの詳細な設定は上記のログを確認してください"
    log "2. 必要に応じてセキュリティグループの設定を行ってください"
    log "3. 環境変数を反映するには、新しいシェルを開くか、sourceコマンドを実行してください"
}

# スクリプトの最後に追加
trap - ERR EXIT  # すべてのトラップをリセット

# スクリプトの実行
main
