#!/bin/bash

# IIR OCOMM 系统服务管理脚本
# Linus 重构版：简洁、实用、零废话

set -e

# === 核心配置（一处定义，到处使用）===
readonly SERVICE_NAME="iir-ocomm"
readonly SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
readonly CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OPTIMIZER_PORT=18181
readonly MAIN_PORT=8000

# 颜色（Linus风格：简单直接）
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# === 系统状态结构（统一管理所有状态）===
declare -A SYSTEM_STATE=(
    ["user"]=""
    ["user_home"]=""
    ["node_path"]=""
    ["optimizer_dir"]=""
    ["optimizer_installed"]="false"
    ["optimizer_running"]="false"
    ["service_installed"]="false"
    ["service_running"]="false"
)

# === 日志函数（Linus风格：直接、零废话）===
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
die() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# === 核心状态检测（一次性获取所有信息）===
detect_system_state() {
    log "检测系统状态..."
    
    # 用户信息（消除特殊情况）
    if [ "$EUID" -eq 0 ]; then
        SYSTEM_STATE["user"]="${SUDO_USER:-root}"
    else
        SYSTEM_STATE["user"]="$(whoami)"
    fi
    
    local user="${SYSTEM_STATE["user"]}"
    if [ "$user" = "root" ]; then
        SYSTEM_STATE["user_home"]="/root"
    else
        SYSTEM_STATE["user_home"]=$(eval echo "~$user")
    fi
    
    # Node.js路径（简化逻辑）
    local node_candidates=(
        "$(command -v node 2>/dev/null || echo "")"
        "${SYSTEM_STATE["user_home"]}/.nvm/versions/node/*/bin/node"
        "/usr/bin/node"
        "/usr/local/bin/node"
    )
    
    for candidate in "${node_candidates[@]}"; do
        if [ -x "$candidate" ]; then
            SYSTEM_STATE["node_path"]="$candidate"
            break
        fi
    done
    
    [ -z "${SYSTEM_STATE["node_path"]}" ] && die "Node.js 未安装"
    
    # Optimizer状态
    SYSTEM_STATE["optimizer_dir"]="${SYSTEM_STATE["user_home"]}/prompt-optimizer"
    [ -d "${SYSTEM_STATE["optimizer_dir"]}" ] && SYSTEM_STATE["optimizer_installed"]="true"
    
    # 检查端口占用
    if command -v lsof >/dev/null 2>&1; then
        lsof -i:$OPTIMIZER_PORT >/dev/null 2>&1 && SYSTEM_STATE["optimizer_running"]="true"
    fi
    
    # 服务状态
    [ -f "$SERVICE_FILE" ] && SYSTEM_STATE["service_installed"]="true"
    systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null && SYSTEM_STATE["service_running"]="true"
    
    success "系统状态检测完成"
}

# === 权限检查（统一处理）===
ensure_root() {
    [ "$EUID" -eq 0 ] || die "需要 root 权限，请使用 sudo"
}

# === 依赖安装（统一处理所有依赖）===
install_dependencies() {
    log "安装项目依赖..."
    
    # Node.js 依赖
    [ -f "$CURRENT_DIR/package.json" ] || die "未找到 package.json"
    cd "$CURRENT_DIR"
    npm install || die "npm install 失败"
    success "Node.js 依赖安装完成"
    
    # Python 依赖
    command -v python3 >/dev/null 2>&1 || die "python3 未安装"
    
    local pip_cmd="pip3"
    command -v pip >/dev/null 2>&1 && pip_cmd="pip"
    
    # 安装 pdf2zh-next
    log "安装 PDF 翻译工具..."
    if ! command -v uv >/dev/null 2>&1; then
        $pip_cmd install --user uv || die "uv 安装失败"
    fi
    
    # 确保 PATH 包含 ~/.local/bin
    export PATH="${SYSTEM_STATE["user_home"]}/.local/bin:$PATH"
    
    if ! command -v pdf2zh_next >/dev/null 2>&1; then
        uv tool install --python 3.12 pdf2zh-next || die "pdf2zh-next 安装失败"
    fi
    
    success "PDF 翻译工具安装完成"
}

# === Optimizer 管理（简化逻辑）===
setup_optimizer() {
    local optimizer_dir="${SYSTEM_STATE["optimizer_dir"]}"
    
    if [ "${SYSTEM_STATE["optimizer_installed"]}" != "true" ]; then
        warn "Prompt Optimizer 未安装"
        echo "安装命令: git clone https://github.com/linshenkx/prompt-optimizer.git $optimizer_dir"
        echo "           cd $optimizer_dir && pnpm install"
        return 0
    fi
    
    # 自动优化UI（隐藏按钮）
    local layout_file="$optimizer_dir/packages/ui/src/components/MainLayout.vue"
    if [ -f "$layout_file" ] && ! grep -q "hide-optimizer-buttons" "$layout_file"; then
        log "优化 Optimizer UI..."
        sed -i '/<\/style>$/i\
/* 隐藏多余按钮 - hide-optimizer-buttons */\
.nav-actions > *:nth-last-child(1),\
.nav-actions > *:nth-last-child(2) {\
  display: none !important;\
}' "$layout_file"
        success "UI 优化完成"
    fi
}

start_optimizer() {
    [ "${SYSTEM_STATE["optimizer_installed"]}" != "true" ] && return 0
    [ "${SYSTEM_STATE["optimizer_running"]}" = "true" ] && return 0
    
    log "启动 Prompt Optimizer..."
    
    local optimizer_dir="${SYSTEM_STATE["optimizer_dir"]}"
    local user="${SYSTEM_STATE["user"]}"
    
    # 查找 pnpm
    local pnpm_paths=(
        "${SYSTEM_STATE["user_home"]}/.local/bin/pnpm"
        "/usr/local/bin/pnpm"
        "/usr/bin/pnpm"
    )
    
    local pnpm_cmd=""
    for path in "${pnpm_paths[@]}"; do
        [ -x "$path" ] && pnpm_cmd="$path" && break
    done
    
    [ -z "$pnpm_cmd" ] && warn "pnpm 未找到，跳过 Optimizer" && return 0
    
    # 启动（后台运行，保留错误输出）
    local log_file="/tmp/optimizer-startup.log"
    log "启动日志: $log_file"
    
    if [ "$EUID" -eq 0 ]; then
        sudo -u "$user" bash -c "cd '$optimizer_dir' && setsid bash -c 'exec \"$pnpm_cmd\" dev </dev/null >\"$log_file\" 2>&1' &"
    else
        (cd "$optimizer_dir" && setsid bash -c "exec '$pnpm_cmd' dev </dev/null >'$log_file' 2>&1") &
    fi
    
    # 等待启动（现实时间：构建+启动需要60秒）
    local timeout=60
    log "等待 Optimizer 构建和启动（最多 ${timeout}s）..."
    for i in $(seq 1 $timeout); do
        # 检查端口是否开放（主要检测方式）
        if lsof -i:$OPTIMIZER_PORT >/dev/null 2>&1; then
            SYSTEM_STATE["optimizer_running"]="true"
            success "Prompt Optimizer 启动成功 (用时 ${i}s)"
            return 0
        fi
        
        # 检查日志中是否有错误
        if [ -f "$log_file" ] && grep -q "ELIFECYCLE\|Error:" "$log_file" 2>/dev/null; then
            warn "Optimizer 启动可能遇到错误，查看日志: tail $log_file"
            # 继续等待，可能只是中间错误
        fi
        
        [ $((i % 10)) -eq 0 ] && log "仍在等待... (${i}/${timeout}s)"
        sleep 1
    done
    
    warn "Prompt Optimizer 启动超时 (>${timeout}s)，查看日志: tail $log_file"
}

stop_optimizer() {
    [ "${SYSTEM_STATE["optimizer_running"]}" != "true" ] && return 0
    
    log "停止 Prompt Optimizer..."
    local pid=$(lsof -ti:$OPTIMIZER_PORT 2>/dev/null | head -1)
    
    if [ -n "$pid" ]; then
        kill -TERM "$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
        SYSTEM_STATE["optimizer_running"]="false"
        success "Prompt Optimizer 已停止"
    fi
}

# === 服务管理（简化版）===
create_service() {
    ensure_root
    
    log "创建系统服务..."
    
    local user="${SYSTEM_STATE["user"]}"
    local user_home="${SYSTEM_STATE["user_home"]}"
    local node_path="${SYSTEM_STATE["node_path"]}"
    
    # 创建启动 wrapper 脚本（使用完整环境配置）
    local wrapper_script="/usr/local/bin/iir-ocomm-wrapper"
    cat > "$wrapper_script" << EOF
#!/bin/bash
# IIR OCOMM 系统服务启动脚本
# 使用完整环境配置，确保所有依赖正确加载

set -e

# 基础配置
USER_HOME="$user_home"
OPTIMIZER_DIR="\$USER_HOME/prompt-optimizer"
OPTIMIZER_PORT=18181

# 日志函数
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] \$1" >&2; }

# 加载完整用户环境（关键修复）
log "加载用户环境..."
[ -f "\$USER_HOME/.bashrc" ] && source "\$USER_HOME/.bashrc"
[ -f "\$USER_HOME/.profile" ] && source "\$USER_HOME/.profile"

# 设置完整PATH（确保pnpm可用）
export PATH="\$USER_HOME/.local/bin:/usr/local/bin:\$PATH"

# 验证pnpm
PNPM_CMD="\$(command -v pnpm 2>/dev/null || echo "")"
[ -z "\$PNPM_CMD" ] && PNPM_CMD="\$USER_HOME/.local/bin/pnpm"

# 启动 Optimizer（如果存在）
if [ -d "\$OPTIMIZER_DIR" ] && [ -x "\$PNPM_CMD" ]; then
    log "启动 Prompt Optimizer..."
    
    # 使用完整环境的后台启动方式
    (
        cd "\$OPTIMIZER_DIR" || exit 1
        
        # 启动Web服务（不启动桌面端，避免X显示问题）
        "\$PNPM_CMD" dev >/tmp/optimizer-service.log 2>&1 &
        OPTIMIZER_PID=\$!
        log "Optimizer PID: \$OPTIMIZER_PID"
        
        # 等待启动（最多30秒）
        for i in \$(seq 1 30); do
            if command -v lsof >/dev/null 2>&1 && lsof -i:\$OPTIMIZER_PORT >/dev/null 2>&1; then
                log "Optimizer 启动成功 (用时 \${i}s)"
                break
            fi
            [ \$i -eq 30 ] && log "Optimizer 启动超时，继续启动主服务..."
            sleep 1
        done
    ) &
    
    # 给 Optimizer 一些启动时间
    sleep 5
else
    log "Optimizer 未安装或 pnpm 不可用，跳过"
fi

# 启动主服务
log "启动主服务..."
cd "$CURRENT_DIR" || exit 1
exec "$node_path" server.js
EOF
    chmod +x "$wrapper_script"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=IIR OCOMM - 医药信息检索平台
After=network.target

[Service]
Type=simple
User=$user
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=production
Environment=PORT=$MAIN_PORT
Environment=HOST=0.0.0.0
Environment=PATH=$user_home/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$wrapper_script
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iir-ocomm

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    SYSTEM_STATE["service_installed"]="true"
    success "系统服务创建完成"
}

start_service() {
    ensure_root
    
    # 强制检查系统状态
    detect_system_state
    
    # 确保 Optimizer 先启动
    start_optimizer
    
    log "启动主服务..."
    systemctl start "$SERVICE_NAME"
    SYSTEM_STATE["service_running"]="true"
    success "服务启动完成"
    show_status
}

stop_service() {
    ensure_root
    
    log "停止服务..."
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    stop_optimizer
    SYSTEM_STATE["service_running"]="false"
    success "服务已停止"
}

uninstall_service() {
    ensure_root
    
    log "卸载服务..."
    stop_service
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl reset-failed
    SYSTEM_STATE["service_installed"]="false"
    success "服务卸载完成"
}

# === 状态显示（简化版）===
show_status() {
    echo "=================================="
    log "IIR OCOMM 系统状态"
    echo "=================================="
    
    # 基础信息
    echo "用户: ${SYSTEM_STATE["user"]}"
    echo "Node.js: ${SYSTEM_STATE["node_path"]}"
    echo "工作目录: $CURRENT_DIR"
    echo ""
    
    # 服务状态
    if [ "${SYSTEM_STATE["service_running"]}" = "true" ]; then
        success "主服务: 运行中"
        echo "  统一首页: http://localhost:$MAIN_PORT"
        echo "  局域网: http://$(hostname -I | awk '{print $1}'):$MAIN_PORT"
    else
        warn "主服务: 已停止"
    fi
    
    if [ "${SYSTEM_STATE["optimizer_running"]}" = "true" ]; then
        success "Optimizer: 运行中 (http://localhost:$OPTIMIZER_PORT)"
    else
        warn "Optimizer: 未运行"
    fi
    
    echo "=================================="
}

# === 统一部署流程（这就是你要的）===
deploy() {
    log "开始完整部署流程..."
    
    # 1. 检测系统状态
    detect_system_state
    
    # 2. 安装依赖
    install_dependencies
    
    # 3. 设置 Optimizer
    setup_optimizer
    
    # 4. 创建服务（如果需要 root）
    if [ "$EUID" -eq 0 ]; then
        create_service
        start_service
    else
        success "依赖安装完成，使用 'sudo $0 deploy' 安装系统服务"
    fi
    
    success "========================================="
    success "  部署完成！"
    success "========================================="
}

# === 主函数（Linus风格：简洁明了）===
main() {
    case "${1:-help}" in
        deploy)     deploy ;;
        install)    detect_system_state; create_service ;;
        start)      detect_system_state; start_service ;;
        stop)       detect_system_state; stop_service ;;
        restart)    detect_system_state; stop_service; start_service ;;
        uninstall)  detect_system_state; uninstall_service ;;
        status)     detect_system_state; show_status ;;
        logs)       journalctl -u "$SERVICE_NAME" -f --no-pager ;;
        *)          
            echo "IIR OCOMM 服务管理脚本 (Linus 重构版)"
            echo ""
            echo "命令:"
            echo "  deploy     完整部署流程（推荐）"
            echo "  install    仅安装服务"
            echo "  start      启动服务（自动启动 Optimizer）"
            echo "  stop       停止服务" 
            echo "  restart    重启服务"
            echo "  status     查看状态"
            echo "  logs       查看日志"
            echo "  uninstall  卸载服务"
            echo ""
            echo "快速开始: $0 deploy"
            ;;
    esac
}

# 执行
main "$@"
