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
NODE_PATH="$(which node)"

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
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请先安装 Node.js"
        log_info "安装命令: sudo apt update && sudo apt install -y nodejs npm"
        exit 1
    fi
    log_info "Node.js 版本: $(node --version)"
}

# 检查项目文件
check_project_files() {
    local required_files=("server.js" "package.json" "web_app/index.html" "web_app/data.json")
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$CURRENT_DIR/$file" ]; then
            log_error "项目文件缺失: $file"
            exit 1
        fi
    done
    
    log_success "项目文件检查通过"
}

# 创建系统服务文件
create_service_file() {
    log_info "创建系统服务文件..."
    
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=IIR OCOMM - 非活性成分数据检索系统
Documentation=https://github.com/your-repo/iir-ocomm
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=production
Environment=PORT=8000
ExecStart=$NODE_PATH server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iir-ocomm

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$CURRENT_DIR

[Install]
WantedBy=multi-user.target
EOF

    log_success "系统服务文件已创建: $SERVICE_FILE"
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
    log_info "卸载 IIR OCOMM 系统服务..."
    
    check_root
    
    # 停止服务
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "停止服务..."
        systemctl stop "$SERVICE_NAME"
    fi
    
    # 禁用服务
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        log_info "禁用服务..."
        systemctl disable "$SERVICE_NAME"
    fi
    
    # 删除服务文件
    if [ -f "$SERVICE_FILE" ]; then
        log_info "删除服务文件..."
        rm -f "$SERVICE_FILE"
    fi
    
    # 重新加载 systemd
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
    systemctl stop "$SERVICE_NAME"
    log_success "服务已停止"
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
        echo "  本地访问: http://localhost:8000"
        echo "  局域网访问: http://$(hostname -I | awk '{print $1}'):8000"
    fi
}

# 查看服务日志
show_logs() {
    log_info "显示 IIR OCOMM 服务日志 (按 Ctrl+C 退出):"
    echo "=================================="
    journalctl -u "$SERVICE_NAME" -f --no-pager
}

# 显示帮助信息
show_help() {
    echo "IIR OCOMM 系统服务管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  install    安装系统服务"
    echo "  uninstall  卸载系统服务"
    echo "  start      启动服务"
    echo "  stop       停止服务"
    echo "  restart    重启服务"
    echo "  status     查看服务状态"
    echo "  logs       查看服务日志"
    echo "  help       显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  sudo $0 install     # 安装服务"
    echo "  sudo $0 start       # 启动服务"
    echo "  $0 status           # 查看状态（无需 sudo）"
    echo "  $0 logs             # 查看日志（无需 sudo）"
    echo "  sudo $0 uninstall   # 卸载服务"
}

# 主函数
main() {
    case "${1:-help}" in
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
