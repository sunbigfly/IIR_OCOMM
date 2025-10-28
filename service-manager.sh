#!/bin/bash
# IIR OCOMM 服务管理 - Linus 极简版
# 核心原则：直接、简单、能用

set -e

# ============ 配置区（唯一需要改的地方） ============
readonly SERVICE_NAME="iir-ocomm"
readonly CONDA_ENV="base"  # 如果需要切换conda环境，改这里

readonly OPTIMIZER_PORT=18181
readonly DUTYINFO_PORT=7860
readonly MAIN_PORT=8000

# ============ 颜色 ============
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# ============ 日志 ============
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
die() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ============ 核心变量（脚本全局状态） ============
USER=""
USER_HOME=""
NODE_PATH=""
PNPM_PATH=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# ============ 环境检测（一次性完成） ============
detect_env() {
    # 用户
    if [ "$EUID" -eq 0 ]; then
        USER="${SUDO_USER:-root}"
    else
        USER="$(whoami)"
    fi
    
    # HOME
    if [ "$USER" = "root" ]; then
        USER_HOME="/root"
    else
        USER_HOME=$(eval echo "~$USER")
    fi
    
    # Node.js（按优先级查找）
    local node_candidates=(
        "$(command -v node 2>/dev/null || true)"
        "$USER_HOME/.nvm/versions/node/v*/bin/node"
        "/usr/bin/node"
    )
    
    for path in "${node_candidates[@]}"; do
        [ -x "$path" ] && NODE_PATH="$path" && break
    done
    [ -z "$NODE_PATH" ] && die "Node.js 未找到"
    
    # pnpm（可选）
    PNPM_PATH=$(command -v pnpm 2>/dev/null || echo "$USER_HOME/.local/bin/pnpm")
    
    ok "环境检测: USER=$USER, NODE=$NODE_PATH"
}

# ============ 端口清理 ============
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        sleep 0.3
        lsof -ti:$port 2>/dev/null | xargs kill -KILL 2>/dev/null || true
    fi
}

cleanup_ports() {
    log "清理端口..."
    kill_port $OPTIMIZER_PORT
    kill_port $DUTYINFO_PORT
    kill_port $MAIN_PORT
    ok "端口已清理"
}

# ============ 依赖安装 ============
install_deps() {
    log "安装依赖..."
    
    # Node.js
    [ -f "$SCRIPT_DIR/package.json" ] || die "package.json 不存在"
    cd "$SCRIPT_DIR"
    npm install || die "npm install 失败"
    
    # Python (pdf2zh-next)
    if ! command -v pdf2zh_next >/dev/null 2>&1; then
        log "安装 pdf2zh-next..."
        command -v uv >/dev/null 2>&1 || pip3 install --user uv
        export PATH="$USER_HOME/.local/bin:$PATH"
        uv tool install --python 3.12 pdf2zh-next || warn "pdf2zh-next 安装失败（可选）"
    fi
    
    ok "依赖安装完成"
}

# ============ 启动子服务（optimizer/dutyinfo） ============
start_optimizer() {
    local dir="$USER_HOME/prompt-optimizer"
    [ ! -d "$dir" ] && { warn "Optimizer 未安装，跳过"; return 0; }
    
    lsof -i:$OPTIMIZER_PORT >/dev/null 2>&1 && { log "Optimizer 已运行"; return 0; }
    
    [ ! -x "$PNPM_PATH" ] && { warn "pnpm 未找到，跳过 Optimizer"; return 0; }
    
    log "启动 Optimizer..."
    
    # 构建启动命令
    local cmd="cd '$dir' && '$PNPM_PATH' dev >/tmp/optimizer.log 2>&1 &"
    
    if [ "$EUID" -eq 0 ]; then
        sudo -u "$USER" bash -c "source $USER_HOME/.bashrc 2>/dev/null || true; $cmd"
    else
        bash -c "source $USER_HOME/.bashrc 2>/dev/null || true; $cmd"
    fi
    
    # 等待启动（最多60秒）
    for i in {1..60}; do
        lsof -i:$OPTIMIZER_PORT >/dev/null 2>&1 && { ok "Optimizer 启动成功 (${i}s)"; return 0; }
        [ $i -eq 1 ] && log "  等待构建..."
        sleep 1
    done
    
    warn "Optimizer 启动超时（可能还在构建，查看 /tmp/optimizer.log）"
}

start_dutyinfo() {
    local dir="$USER_HOME/dutyinfo/web_ui"
    [ ! -d "$dir" ] && { warn "DutyInfo 未安装，跳过"; return 0; }
    
    lsof -i:$DUTYINFO_PORT >/dev/null 2>&1 && { log "DutyInfo 已运行"; return 0; }
    
    [ ! -x "$dir/start.sh" ] && { warn "start.sh 不可执行，跳过"; return 0; }
    
    log "启动 DutyInfo..."
    
    # 构建启动命令（加载conda环境）
    local conda_init="$USER_HOME/anaconda3/etc/profile.d/conda.sh"
    local cmd=""
    
    if [ -f "$conda_init" ]; then
        cmd="source '$conda_init' && conda activate $CONDA_ENV && cd '$dir' && ./start.sh >/tmp/dutyinfo.log 2>&1 &"
    else
        cmd="cd '$dir' && ./start.sh >/tmp/dutyinfo.log 2>&1 &"
    fi
    
    if [ "$EUID" -eq 0 ]; then
        sudo -u "$USER" bash -c "$cmd"
    else
        bash -c "$cmd"
    fi
    
    # 等待启动（最多30秒）
    for i in {1..30}; do
        lsof -i:$DUTYINFO_PORT >/dev/null 2>&1 && { ok "DutyInfo 启动成功 (${i}s)"; return 0; }
        sleep 1
    done
    
    warn "DutyInfo 启动超时（查看 /tmp/dutyinfo.log）"
}

stop_deps() {
    log "停止子服务..."
    kill_port $OPTIMIZER_PORT
    kill_port $DUTYINFO_PORT
    ok "子服务已停止"
}

# ============ systemd 服务管理 ============
create_service() {
    [ "$EUID" -ne 0 ] && die "需要 root 权限"
    
    log "创建 systemd 服务..."
    
    # 创建环境初始化脚本
    local env_script="/usr/local/bin/${SERVICE_NAME}-env"
    cat > "$env_script" <<EOF
#!/bin/bash
# 环境初始化
export USER_HOME="$USER_HOME"
export PATH="$USER_HOME/.local/bin:$USER_HOME/anaconda3/bin:/usr/local/bin:\$PATH"

# 加载 conda
[ -f "\$USER_HOME/anaconda3/etc/profile.d/conda.sh" ] && {
    source "\$USER_HOME/anaconda3/etc/profile.d/conda.sh"
    conda activate $CONDA_ENV
}

exec "\$@"
EOF
    chmod +x "$env_script"
    
    # 创建 service 文件
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=IIR OCOMM - 医药信息检索平台
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
Environment=NODE_ENV=production
Environment=PORT=$MAIN_PORT
ExecStartPre=$SCRIPT_DIR/$(basename $0) start-deps
ExecStart=$env_script $NODE_PATH $SCRIPT_DIR/server.js
ExecStopPost=$SCRIPT_DIR/$(basename $0) stop-deps
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    ok "服务创建完成"
}

start_service() {
    [ "$EUID" -ne 0 ] && die "需要 root 权限"
    
    cleanup_ports
    
    log "启动服务..."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "⏳ 启动流程（可能需要 60-90 秒）"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    log "步骤 1/3: 启动 Prompt Optimizer..."
    log "  ├─ 构建前端（Vite 打包）"
    log "  └─ 预计耗时: 30-60 秒"
    echo ""
    
    log "步骤 2/3: 启动 DutyInfo..."
    log "  ├─ 初始化 Gradio 应用"
    log "  └─ 预计耗时: 5-10 秒"
    echo ""
    
    log "步骤 3/3: 启动主服务..."
    log "  └─ 预计耗时: 2-3 秒"
    echo ""
    
    # 启动服务
    systemctl start "$SERVICE_NAME"
    
    # 等待主服务启动
    log "等待主服务启动..."
    for i in {1..30}; do
        if lsof -i:$MAIN_PORT >/dev/null 2>&1; then
            ok "主服务启动成功 (${i}s)"
            break
        fi
        [ $i -eq 30 ] && warn "主服务启动超时"
        sleep 1
    done
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ok "✅ 服务启动完成！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    sleep 1
    show_status
    
    echo ""
    log "💡 提示:"
    echo "   - Optimizer 可能还在构建，稍后访问 http://localhost:$OPTIMIZER_PORT"
    echo "   - 查看详细日志: sudo journalctl -u $SERVICE_NAME -f"
}

stop_service() {
    [ "$EUID" -ne 0 ] && die "需要 root 权限"
    
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    cleanup_ports
    ok "服务已停止"
}

uninstall_service() {
    [ "$EUID" -ne 0 ] && die "需要 root 权限"
    
    log "完整卸载服务..."
    
    # 1. 停止服务
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    cleanup_ports
    
    # 2. 禁用并删除服务
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl reset-failed 2>/dev/null || true
    
    # 3. 清理wrapper脚本（新旧版本）
    rm -f "/usr/local/bin/${SERVICE_NAME}-env"
    rm -f "/usr/local/bin/${SERVICE_NAME}-wrapper"
    
    # 4. 清理临时日志
    rm -f /tmp/optimizer*.log
    rm -f /tmp/dutyinfo*.log
    
    echo ""
    ok "========================================="
    ok "  服务已完全卸载！"
    ok "========================================="
    echo ""
    log "已清理:"
    echo "  ✓ systemd 服务文件"
    echo "  ✓ wrapper 脚本（新旧版本）"
    echo "  ✓ 临时日志文件"
    echo "  ✓ 运行中的进程"
    echo ""
}

# ============ 状态显示 ============
show_status() {
    echo "=================================="
    log "IIR OCOMM 系统状态"
    echo "=================================="
    echo "用户: $USER"
    echo "Node: $NODE_PATH"
    echo "目录: $SCRIPT_DIR"
    echo ""
    
    # 检查服务状态
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        ok "主服务: 运行中"
        echo "  访问: http://localhost:$MAIN_PORT"
    else
        warn "主服务: 已停止"
    fi
    
    lsof -i:$OPTIMIZER_PORT >/dev/null 2>&1 && ok "Optimizer: http://localhost:$OPTIMIZER_PORT" || warn "Optimizer: 未运行"
    lsof -i:$DUTYINFO_PORT >/dev/null 2>&1 && ok "DutyInfo: http://localhost:$DUTYINFO_PORT" || warn "DutyInfo: 未运行"
    
    echo "=================================="
}

# ============ 部署流程 ============
deploy() {
    log "开始部署..."
    
    detect_env
    install_deps
    
    if [ "$EUID" -eq 0 ]; then
        create_service
        start_service
        ok "========================================="
        ok "  部署完成！访问 http://localhost:$MAIN_PORT"
        ok "========================================="
    else
        ok "依赖安装完成，使用 'sudo $0 deploy' 完成安装"
    fi
}

# ============ 主函数 ============
main() {
    case "${1:-help}" in
        deploy)
            deploy
            ;;
        install)
            detect_env
            create_service
            ;;
        start)
            detect_env
            start_service
            ;;
        stop)
            detect_env
            stop_service
            ;;
        restart)
            detect_env
            stop_service
            start_service
            ;;
        uninstall)
            detect_env
            uninstall_service
            ;;
        status)
            detect_env
            show_status
            ;;
        logs)
            journalctl -u "$SERVICE_NAME" -f --no-pager
            ;;
        start-deps)
            # systemd 内部调用
            detect_env
            start_optimizer
            start_dutyinfo
            ;;
        stop-deps)
            # systemd 内部调用（清理端口不需要detect_env）
            stop_deps
            ;;
        *)
            echo "IIR OCOMM 服务管理 (Linus 极简版)"
            echo ""
            echo "命令:"
            echo "  deploy     完整部署（推荐）"
            echo "  install    安装服务"
            echo "  start      启动服务"
            echo "  stop       停止服务"
            echo "  restart    重启服务"
            echo "  status     查看状态"
            echo "  logs       查看日志"
            echo "  uninstall  卸载服务"
            echo ""
            echo "快速开始: sudo $0 deploy"
            ;;
    esac
}

main "$@"

