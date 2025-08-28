#!/bin/bash

# IIR OCOMM Systemd 服务安装脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
SERVICE_NAME="iir-ocomm"
INSTALL_DIR="/opt/iir-ocomm"
SERVICE_USER="www-data"
SERVICE_PORT="8000"

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

# 检查是否以root权限运行
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请以root权限运行此脚本: sudo $0"
        exit 1
    fi
}

# 安装systemd服务
install_service() {
    log_info "安装IIR OCOMM systemd服务..."
    
    # 创建安装目录
    log_info "创建安装目录: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR/logs"
    
    # 复制文件
    log_info "复制应用文件..."
    cp -r web_app/* "$INSTALL_DIR/"
    
    # 设置权限
    log_info "设置文件权限..."
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    
    # 创建systemd服务文件
    log_info "创建systemd服务文件..."
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=IIR OCOMM 非活性成分数据检索系统
Documentation=https://github.com/your-repo/IIR_OCOMM
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 -m http.server $SERVICE_PORT
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/logs

# 环境变量
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载systemd
    log_info "重新加载systemd配置..."
    systemctl daemon-reload
    
    # 启用服务
    log_info "启用服务..."
    systemctl enable "$SERVICE_NAME"
    
    log_success "服务安装完成!"
}

# 启动服务
start_service() {
    log_info "启动服务..."
    systemctl start "$SERVICE_NAME"
    
    # 检查服务状态
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "服务启动成功!"
        log_info "访问地址: http://localhost:$SERVICE_PORT"
        log_info "服务状态: systemctl status $SERVICE_NAME"
        log_info "查看日志: journalctl -u $SERVICE_NAME -f"
    else
        log_error "服务启动失败!"
        systemctl status "$SERVICE_NAME"
        exit 1
    fi
}

# 卸载服务
uninstall_service() {
    log_info "卸载IIR OCOMM systemd服务..."
    
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
    if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
        log_info "删除服务文件..."
        rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    fi
    
    # 重新加载systemd
    systemctl daemon-reload
    
    # 删除安装目录
    if [ -d "$INSTALL_DIR" ]; then
        log_warning "是否删除安装目录 $INSTALL_DIR? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
            log_success "安装目录已删除"
        fi
    fi
    
    log_success "服务卸载完成!"
}

# 显示服务状态
show_status() {
    log_info "服务状态:"
    systemctl status "$SERVICE_NAME" --no-pager
    
    echo ""
    log_info "最近日志:"
    journalctl -u "$SERVICE_NAME" --no-pager -n 10
}

# 显示帮助
show_help() {
    echo "IIR OCOMM Systemd 服务管理脚本"
    echo ""
    echo "用法: sudo $0 [命令]"
    echo ""
    echo "命令:"
    echo "  install    安装并启动服务"
    echo "  uninstall  卸载服务"
    echo "  start      启动服务"
    echo "  stop       停止服务"
    echo "  restart    重启服务"
    echo "  status     查看服务状态"
    echo "  logs       查看服务日志"
    echo "  help       显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  sudo $0 install    # 安装并启动服务"
    echo "  sudo $0 status     # 查看服务状态"
    echo "  sudo $0 logs       # 查看服务日志"
}

# 主函数
main() {
    case "${1:-help}" in
        install)
            check_root
            install_service
            start_service
            ;;
        uninstall)
            check_root
            uninstall_service
            ;;
        start)
            check_root
            systemctl start "$SERVICE_NAME"
            log_success "服务已启动"
            ;;
        stop)
            check_root
            systemctl stop "$SERVICE_NAME"
            log_success "服务已停止"
            ;;
        restart)
            check_root
            systemctl restart "$SERVICE_NAME"
            log_success "服务已重启"
            ;;
        status)
            show_status
            ;;
        logs)
            journalctl -u "$SERVICE_NAME" -f
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
