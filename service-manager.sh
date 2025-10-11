#!/bin/bash

# IIR OCOMM 系统服务管理脚本
# 用于在 Ubuntu 系统中注册、管理和卸载 IIR OCOMM 服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SERVICE_NAME="iir-ocomm"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="$(whoami)"
NODE_PATH=""

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "此操作需要 root 权限，请使用 sudo 运行"
        exit 1
    fi
}

# 检查 Node.js 是否安装
check_node() {
    log_info "检查 Node.js 安装..."
    
    # 如果当前用户是root，获取真实用户信息
    local real_user="$USER_NAME"
    local real_home
    if [ "$EUID" -eq 0 ] && [ "$USER_NAME" = "root" ]; then
        # 从环境变量获取真实用户
        real_user="${SUDO_USER:-$USER_NAME}"
        real_home=$(eval echo "~$real_user")
    else
        real_home="$HOME"
    fi
    
    log_info "真实用户: $real_user, HOME: $real_home"
    
    # 尝试以真实用户身份查找node
    if [ "$EUID" -eq 0 ] && [ "$real_user" != "root" ]; then
        local user_node_path=$(sudo -u "$real_user" bash -c 'which node' 2>/dev/null || echo "")
        if [ -n "$user_node_path" ] && [ -x "$user_node_path" ]; then
            NODE_PATH="$user_node_path"
            log_info "找到 Node.js: $NODE_PATH"
            log_info "Node.js 版本: $($NODE_PATH --version)"
            return 0
        fi
        
        # 检查nvm路径
        local nvm_path="$real_home/.nvm/versions/node"
        if [ -d "$nvm_path" ]; then
            # 优先查找最新版本
            local latest_node=$(find "$nvm_path" -path "*/bin/node" -type f -executable | sort -V | tail -1)
            if [ -n "$latest_node" ] && [ -x "$latest_node" ]; then
                NODE_PATH="$latest_node"
                log_info "找到 Node.js (nvm): $NODE_PATH"
                log_info "Node.js 版本: $($NODE_PATH --version)"
                return 0
            fi
            
            # 如果上面没找到，尝试直接列举目录
            for version_dir in "$nvm_path"/*/; do
                local node_bin="$version_dir/bin/node"
                if [ -x "$node_bin" ]; then
                    NODE_PATH="$node_bin"
                    log_info "找到 Node.js (nvm): $NODE_PATH"
                    log_info "Node.js 版本: $($NODE_PATH --version)"
                    return 0
                fi
            done
        fi
    fi
    
    # 检查标准路径
    local standard_paths=("/usr/bin/node" "/usr/local/bin/node")
    for path in "${standard_paths[@]}"; do
        if [ -x "$path" ]; then
            NODE_PATH="$path"
            log_info "找到 Node.js: $NODE_PATH"
            log_info "Node.js 版本: $($NODE_PATH --version)"
            return 0
        fi
    done
    
    # 如果都找不到，报错
    log_error "Node.js 未找到，请确保已正确安装 Node.js"
    log_info "安装命令: sudo apt update && sudo apt install -y nodejs npm"
    log_info "或使用 nvm 安装: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    exit 1
}

# 检查项目文件
check_project_files() {
    local required_files=("server.js" "package.json" "src/server/app.js" "src/public/home.html")
    local required_dirs=("src/server" "src/public" "data")
    
    # 检查必需文件
    for file in "${required_files[@]}"; do
        if [ ! -f "$CURRENT_DIR/$file" ]; then
            log_error "项目文件缺失: $file"
            exit 1
        fi
    done
    
    # 检查必需目录
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$CURRENT_DIR/$dir" ]; then
            log_error "项目目录缺失: $dir"
            exit 1
        fi
    done
    
    log_success "项目文件检查通过"
}

# 创建系统服务文件
create_service_file() {
    log_info "创建系统服务文件..."
    
    # 获取真实用户名
    local real_user="${SUDO_USER:-$USER_NAME}"
    if [ "$real_user" = "root" ]; then
        real_user="$USER_NAME"
    fi
    
    log_info "服务将以用户 '$real_user' 身份运行"
    log_info "Node.js 路径: $NODE_PATH"
    log_info "工作目录: $CURRENT_DIR"
    
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=IIR OCOMM - 医药信息检索平台
Documentation=https://github.com/your-repo/iir-ocomm
After=network.target

[Service]
Type=simple
User=$real_user
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=production
Environment=PORT=8000
Environment=HOST=0.0.0.0
ExecStart=$NODE_PATH server.js
Restart=always
RestartSec=10
TimeoutStopSec=30
KillMode=mixed
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iir-ocomm

# 安全设置（放松限制以支持 nvm）
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=false
ProtectHome=false

[Install]
WantedBy=multi-user.target
EOF

    log_success "系统服务文件已创建: $SERVICE_FILE"
    log_info "验证 Node.js 路径..."
    if [ ! -x "$NODE_PATH" ]; then
        log_error "Node.js 路径不可执行: $NODE_PATH"
        exit 1
    else
        log_success "Node.js 路径验证成功"
    fi
}

# 安装服务
install_service() {
    log_info "安装 IIR OCOMM 系统服务..."
    
    check_root
    check_node
    check_project_files
    
    # 创建服务文件
    create_service_file
    
    # 重新加载 systemd
    systemctl daemon-reload
    
    # 启用服务（开机自启）
    systemctl enable "$SERVICE_NAME"
    
    log_success "服务安装完成!"
    log_info "使用以下命令管理服务:"
    echo "  启动服务: sudo systemctl start $SERVICE_NAME"
    echo "  停止服务: sudo systemctl stop $SERVICE_NAME"
    echo "  重启服务: sudo systemctl restart $SERVICE_NAME"
    echo "  查看状态: sudo systemctl status $SERVICE_NAME"
    echo "  查看日志: sudo journalctl -u $SERVICE_NAME -f"
}

# 卸载服务
uninstall_service() {
    check_root
    
    log_info "卸载 IIR OCOMM 系统服务..."
    
    # 停止服务
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "停止服务..."
        systemctl stop "$SERVICE_NAME"
        log_success "服务已停止"
    else
        log_info "服务未运行"
    fi
    
    # 禁用服务
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "禁用服务..."
        systemctl disable "$SERVICE_NAME"
        log_success "服务已禁用"
    else
        log_info "服务未启用"
    fi
    
    # 删除服务文件
    if [ -f "$SERVICE_FILE" ]; then
        log_info "删除服务文件..."
        rm -f "$SERVICE_FILE"
        log_success "服务文件已删除"
    else
        log_info "服务文件不存在"
    fi
    
    # 重新加载 systemd
    log_info "重新加载 systemd 配置..."
    systemctl daemon-reload
    systemctl reset-failed
    
    log_success "服务卸载完成!"
}

# 启动服务
start_service() {
    check_root
    log_info "启动 IIR OCOMM 服务..."
    systemctl start "$SERVICE_NAME"
    log_success "服务已启动"
    show_status
}

# 停止服务
stop_service() {
    check_root
    log_info "停止 IIR OCOMM 服务..."
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME"
        log_success "服务已停止"
    else
        log_warning "服务未运行或已停止"
    fi
}

# 重启服务
restart_service() {
    check_root
    log_info "重启 IIR OCOMM 服务..."
    systemctl restart "$SERVICE_NAME"
    log_success "服务已重启"
    show_status
}

# 查看服务状态
show_status() {
    log_info "IIR OCOMM 服务状态:"
    echo "=================================="
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "服务状态: 运行中"
    else
        log_warning "服务状态: 已停止"
    fi
    
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        log_info "开机自启: 已启用"
    else
        log_warning "开机自启: 已禁用"
    fi
    
    echo ""
    systemctl status "$SERVICE_NAME" --no-pager -l
    echo "=================================="
    
    # 显示访问信息
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo ""
        log_info "访问地址:"
        echo "  统一首页: http://localhost:8000"
        echo "  FDA检索:  http://localhost:8000/fda"
        echo "  辅料手册: http://localhost:8000/handbook"
        echo "  局域网访问: http://$(hostname -I | awk '{print $1}'):8000"
    fi
}

# 查看服务日志
show_logs() {
    log_info "显示 IIR OCOMM 服务日志 (按 Ctrl+C 退出):"
    echo "=================================="
    journalctl -u "$SERVICE_NAME" -f --no-pager
}

# 强制清理（杀死所有相关进程）
force_cleanup() {
    log_info "强制清理所有 IIR OCOMM 相关进程..."
    
    # 查找并杀死所有相关的 Node.js 进程
    PIDS=$(ps aux | grep -E "node.*server\.js|iir-ocomm" | grep -v grep | awk '{print $2}' | grep -v "$$")
    
    if [ -n "$PIDS" ]; then
        log_info "找到相关进程: $PIDS"
        echo "$PIDS" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        
        # 检查是否还有残留进程
        REMAINING_PIDS=$(ps aux | grep -E "node.*server\.js|iir-ocomm" | grep -v grep | awk '{print $2}' | grep -v "$$")
        if [ -n "$REMAINING_PIDS" ]; then
            log_warning "强制杀死残留进程: $REMAINING_PIDS"
            echo "$REMAINING_PIDS" | xargs -r kill -KILL 2>/dev/null || true
        fi
        
        log_success "进程清理完成"
    else
        log_info "未找到相关进程"
    fi
    
    # 检查端口占用
    if command -v ss >/dev/null 2>&1; then
        PORT_CHECK=$(ss -tulpn | grep ":8000" | head -1)
        if [ -n "$PORT_CHECK" ]; then
            log_warning "端口 8000 仍被占用:"
            echo "$PORT_CHECK"
        else
            log_success "端口 8000 已释放"
        fi
    fi
}

# 初始化部署环境
setup_environment() {
    log_info "开始初始化部署环境..."
    
    # 检查项目目录
    if [ ! -f "$CURRENT_DIR/package.json" ]; then
        log_error "未找到 package.json，请确保在项目根目录运行"
        exit 1
    fi
    
    # 1. 安装 Node.js 依赖
    log_info "步骤 1/3: 安装 Node.js 依赖..."
    if command -v npm >/dev/null 2>&1; then
        cd "$CURRENT_DIR"
        npm install
        log_success "Node.js 依赖安装完成"
    else
        log_error "npm 未安装，请先安装 Node.js"
        exit 1
    fi
    
    # 2. 检查 Python
    log_info "步骤 2/3: 检查 Python 环境..."
    if ! command -v python3 >/dev/null 2>&1; then
        log_error "python3 未安装，请先安装 Python 3"
        exit 1
    fi
    
    local python_version=$(python3 --version 2>&1 | awk '{print $2}')
    log_info "Python 版本: $python_version"
    
    # 3. 安装 pdf2zh-next
    log_info "步骤 3/3: 安装 pdf2zh-next..."
    
    # 检查 pip
    if ! command -v pip >/dev/null 2>&1 && ! command -v pip3 >/dev/null 2>&1; then
        log_error "pip 未安装，请先安装 pip"
        exit 1
    fi
    
    local pip_cmd="pip3"
    if command -v pip >/dev/null 2>&1; then
        pip_cmd="pip"
    fi
    
    # 安装 uv
    log_info "安装 uv..."
    if command -v uv >/dev/null 2>&1; then
        log_success "uv 已安装"
    else
        $pip_cmd install --user uv
        log_success "uv 安装完成"
    fi
    
    # 使用 uv 安装 pdf2zh-next
    log_info "使用 uv 安装 pdf2zh-next..."
    if command -v uv >/dev/null 2>&1; then
        uv tool install --python 3.12 pdf2zh-next
        log_success "pdf2zh-next 安装完成"
    else
        log_error "uv 安装失败，请手动执行: pip install uv && uv tool install --python 3.12 pdf2zh-next"
        exit 1
    fi
    
    # 4. 验证安装
    log_info "验证安装..."
    echo ""
    
    # 验证 Node.js
    if command -v node >/dev/null 2>&1; then
        log_success "✓ Node.js: $(node --version)"
    else
        log_error "✗ Node.js 未安装"
    fi
    
    # 验证 pdf2zh_next
    if command -v pdf2zh_next >/dev/null 2>&1; then
        log_success "✓ pdf2zh_next: 已安装"
    else
        log_warning "✗ pdf2zh_next 未找到，可能需要添加到 PATH"
        log_info "  请将 uv 工具目录添加到 PATH，通常是: ~/.local/bin"
        log_info "  执行: export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
    
    echo ""
    log_success "========================================="
    log_success "  环境初始化完成！"
    log_success "========================================="
    echo ""
    log_info "下一步操作："
    echo "  1. 启动服务: npm start"
    echo "  2. 访问地址: http://localhost:8000"
    echo "  3. 安装系统服务: sudo $0 install"
    echo ""
}

# 显示帮助信息
show_help() {
    echo "IIR OCOMM 系统服务管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  setup      初始化部署环境（安装依赖和pdf2zh-next）"
    echo "  install    安装系统服务"
    echo "  uninstall  卸载系统服务"
    echo "  start      启动服务"
    echo "  stop       停止服务"
    echo "  restart    重启服务"
    echo "  status     查看服务状态"
    echo "  logs       查看服务日志"
    echo "  cleanup    强制清理所有相关进程"
    echo "  help       显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 setup            # 初始化环境（首次部署）"
    echo "  sudo $0 install     # 安装服务"
    echo "  sudo $0 start       # 启动服务"
    echo "  $0 status           # 查看状态（无需 sudo）"
    echo "  $0 logs             # 查看日志（无需 sudo）"
    echo "  $0 cleanup          # 强制清理进程（无需 sudo）"
    echo "  sudo $0 uninstall   # 卸载服务"
    echo ""
    echo "快速部署流程:"
    echo "  1. $0 setup         # 安装所有依赖"
    echo "  2. npm start        # 测试运行"
    echo "  3. sudo $0 install  # 安装为系统服务（可选）"
}

# 主函数
main() {
    case "${1:-help}" in
        setup)
            setup_environment
            ;;
        install)
            install_service
            ;;
        uninstall)
            uninstall_service
            ;;
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        cleanup)
            force_cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
