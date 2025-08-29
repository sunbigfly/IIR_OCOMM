#!/bin/bash

# IIR OCOMM 非活性成分数据检索系统 - WSL部署脚本
# 适用于 WSL (Windows Subsystem for Linux) 环境

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_NAME="IIR_OCOMM"
WEB_DIR="web_app"
PORT=8000
EXCEL_FILE="IIR_OCOMM-非活性成分字段描述.xlsx"

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

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 命令未找到"
        return 1
    fi
    return 0
}

# 检查文件是否存在
check_file() {
    if [ ! -f "$1" ]; then
        log_error "文件不存在: $1"
        return 1
    fi
    return 0
}

# 显示帮助信息
show_help() {
    echo "IIR OCOMM 部署脚本 - WSL环境"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -p, --port     指定端口号 (默认: 8000)"
    echo "  -d, --dev      开发模式 (自动重启)"
    echo "  -b, --build    仅构建，不启动服务"
    echo "  -s, --start    仅启动服务，不重新构建"
    echo "  -c, --clean    清理构建文件"
    echo "  --nginx        使用Nginx部署"
    echo "  --apache       使用Apache部署"
    echo "  --daemon       后台运行模式"
    echo "  --stop         停止后台服务"
    echo "  --status       查看服务状态"
    echo "  --logs         查看服务日志"
    echo "  --network      开启局域网访问"
    echo "  --firewall     配置防火墙规则"
    echo ""
    echo "示例:"
    echo "  $0                    # 完整部署并启动"
    echo "  $0 -p 3000           # 在端口3000启动"
    echo "  $0 -d                # 开发模式"
    echo "  $0 --nginx           # 使用Nginx部署"
    echo "  $0 -n --daemon       # 后台启动并开启局域网访问"
    echo "  $0 --network         # 查看局域网访问配置"
    echo "  $0 --firewall        # 配置防火墙规则"
}

# 检查WSL环境
check_wsl_environment() {
    log_info "检查WSL环境..."
    
    if [ ! -f /proc/version ] || ! grep -q "microsoft" /proc/version; then
        log_warning "当前可能不在WSL环境中"
    else
        log_success "WSL环境检查通过"
    fi
    
    # 检查必要的命令
    local required_commands=("python3" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! check_command $cmd; then
            log_error "请安装 $cmd: sudo apt update && sudo apt install -y $cmd"
            exit 1
        fi
    done
    
    log_success "基础环境检查完成"
}

# 安装uv包管理器
install_uv() {
    if ! check_command "uv"; then
        log_info "安装uv包管理器..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        source $HOME/.cargo/env
        if ! check_command "uv"; then
            log_error "uv安装失败"
            exit 1
        fi
        log_success "uv安装完成"
    else
        log_info "uv已安装"
    fi
}

# 初始化Python环境
setup_python_env() {
    log_info "设置Python环境..."
    
    if [ ! -f "pyproject.toml" ]; then
        log_info "初始化Python项目..."
        uv init --no-readme
    fi
    
    log_info "安装Python依赖..."
    uv add pandas openpyxl
    
    log_success "Python环境设置完成"
}

# 构建数据文件
build_data() {
    log_info "构建数据文件..."
    
    # 检查Excel文件
    if ! check_file "$EXCEL_FILE"; then
        log_error "Excel数据文件不存在，请确保 $EXCEL_FILE 在当前目录"
        exit 1
    fi
    
    # 创建web_app目录
    mkdir -p $WEB_DIR
    
    # 转换Excel到JSON
    log_info "转换Excel数据到JSON格式..."
    if [ -f "convert_excel_to_json.py" ]; then
        uv run python convert_excel_to_json.py
    else
        log_error "转换脚本不存在: convert_excel_to_json.py"
        exit 1
    fi
    
    # 修复JSON文件
    if [ -f "fix_json.py" ]; then
        log_info "修复JSON格式..."
        uv run python fix_json.py
    fi
    
    # 替换NaN值（备用方案）
    if [ -f "$WEB_DIR/data.json" ]; then
        sed -i 's/NaN/null/g' "$WEB_DIR/data.json"
        log_success "数据文件构建完成"
    else
        log_error "数据文件生成失败"
        exit 1
    fi
}

# 验证构建结果
validate_build() {
    log_info "验证构建结果..."
    
    local required_files=("$WEB_DIR/index.html" "$WEB_DIR/styles.css" "$WEB_DIR/script.js" "$WEB_DIR/data.json")
    
    for file in "${required_files[@]}"; do
        if ! check_file "$file"; then
            log_error "构建验证失败，缺少文件: $file"
            exit 1
        fi
    done
    
    # 验证JSON格式
    if ! python3 -c "import json; json.load(open('$WEB_DIR/data.json'))" 2>/dev/null; then
        log_error "JSON文件格式验证失败"
        exit 1
    fi
    
    log_success "构建验证通过"
}

# 启动开发服务器
start_dev_server() {
    local port=$1
    local daemon_mode=$2
    local bind_address=${3:-"127.0.0.1"}
    log_info "启动开发服务器 (端口: $port, 绑定地址: $bind_address)..."

    cd $WEB_DIR

    # 检查端口是否被占用
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        log_warning "端口 $port 已被占用，尝试终止现有进程..."
        pkill -f "python.*http.server.*$port" || true
        sleep 2
    fi

    if [ "$daemon_mode" = true ]; then
        # 后台模式
        local log_file="../logs/server.log"
        local pid_file="../logs/server.pid"

        # 创建日志目录
        mkdir -p ../logs

        # 启动后台服务
        nohup python3 -m http.server "$port" --bind "$bind_address" > "$log_file" 2>&1 &
        local server_pid=$!
        echo $server_pid > "$pid_file"

        log_success "服务器已在后台启动 (PID: $server_pid)"
        if [ "$bind_address" = "0.0.0.0" ]; then
            log_info "本地访问: http://localhost:$port"
            log_info "局域网访问: http://$(hostname -I | awk '{print $1}'):$port"
            log_info "网络访问已开启，局域网内其他设备可以访问"
        else
            log_info "访问地址: http://localhost:$port"
            log_info "WSL访问地址: http://$(hostname -I | awk '{print $1}'):$port"
        fi
        log_info "日志文件: $(pwd)/$log_file"
        log_info "使用 $0 --stop 停止服务"
        log_info "使用 $0 --logs 查看日志"
    else
        # 前台模式
        log_success "服务器启动成功!"
        if [ "$bind_address" = "0.0.0.0" ]; then
            log_info "本地访问: http://localhost:$port"
            log_info "局域网访问: http://$(hostname -I | awk '{print $1}'):$port"
            log_info "网络访问已开启，局域网内其他设备可以访问"
        else
            log_info "访问地址: http://localhost:$port"
            log_info "WSL访问地址: http://$(hostname -I | awk '{print $1}'):$port"
        fi
        log_info "按 Ctrl+C 停止服务器"

        python3 -m http.server "$port" --bind "$bind_address"
    fi
}

# 使用Nginx部署
deploy_nginx() {
    log_info "使用Nginx部署..."
    
    # 检查Nginx
    if ! check_command "nginx"; then
        log_info "安装Nginx..."
        sudo apt update
        sudo apt install -y nginx
    fi
    
    # 创建Nginx配置
    local nginx_config="/etc/nginx/sites-available/$PROJECT_NAME"
    local web_root="$(pwd)/$WEB_DIR"
    
    sudo tee $nginx_config > /dev/null <<EOF
server {
    listen 80;
    server_name localhost;
    root $web_root;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
    
    location ~* \.(js|css|json)$ {
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
    
    # 启用gzip压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
EOF
    
    # 启用站点
    sudo ln -sf $nginx_config /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # 测试配置
    sudo nginx -t
    
    # 重启Nginx
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    
    log_success "Nginx部署完成!"
    log_info "访问地址: http://localhost"
    log_info "WSL访问地址: http://$(hostname -I | awk '{print $1}')"
}

# 使用Apache部署
deploy_apache() {
    log_info "使用Apache部署..."
    
    # 检查Apache
    if ! check_command "apache2"; then
        log_info "安装Apache..."
        sudo apt update
        sudo apt install -y apache2
    fi
    
    # 创建虚拟主机配置
    local apache_config="/etc/apache2/sites-available/$PROJECT_NAME.conf"
    local web_root="$(pwd)/$WEB_DIR"
    
    sudo tee $apache_config > /dev/null <<EOF
<VirtualHost *:80>
    DocumentRoot $web_root
    ServerName localhost
    
    <Directory $web_root>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
    
    # 启用压缩
    LoadModule deflate_module modules/mod_deflate.so
    <Location />
        SetOutputFilter DEFLATE
        SetEnvIfNoCase Request_URI \\.(?:gif|jpe?g|png)$ no-gzip dont-vary
        SetEnvIfNoCase Request_URI \\.(?:exe|t?gz|zip|bz2|sit|rar)$ no-gzip dont-vary
    </Location>
</VirtualHost>
EOF
    
    # 启用站点
    sudo a2ensite $PROJECT_NAME
    sudo a2dissite 000-default
    sudo a2enmod deflate
    
    # 重启Apache
    sudo systemctl restart apache2
    sudo systemctl enable apache2
    
    log_success "Apache部署完成!"
    log_info "访问地址: http://localhost"
    log_info "WSL访问地址: http://$(hostname -I | awk '{print $1}')"
}

# 停止后台服务
stop_daemon() {
    log_info "停止后台服务..."

    local pid_file="logs/server.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            rm -f "$pid_file"
            log_success "服务已停止 (PID: $pid)"
        else
            log_warning "进程 $pid 不存在，清理PID文件"
            rm -f "$pid_file"
        fi
    else
        log_warning "未找到PID文件，尝试通过进程名停止..."
        pkill -f "python.*http.server" && log_success "服务已停止" || log_warning "未找到运行中的服务"
    fi
}

# 查看服务状态
check_status() {
    log_info "检查服务状态..."

    local pid_file="logs/server.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            local port=$(netstat -tulnp 2>/dev/null | grep "$pid" | grep -o ':[0-9]*' | head -1 | cut -d: -f2)
            log_success "服务正在运行 (PID: $pid, 端口: ${port:-未知})"
            log_info "访问地址: http://localhost:${port:-8000}"
            log_info "WSL访问地址: http://$(hostname -I | awk '{print $1}'):${port:-8000}"
        else
            log_warning "PID文件存在但进程不在运行，清理PID文件"
            rm -f "$pid_file"
        fi
    else
        # 检查是否有其他python http.server进程
        local running_servers=$(pgrep -f "python.*http.server" || true)
        if [ -n "$running_servers" ]; then
            log_warning "发现运行中的服务进程，但无PID文件:"
            ps aux | grep "python.*http.server" | grep -v grep
        else
            log_info "服务未运行"
        fi
    fi
}

# 查看服务日志
show_logs() {
    local log_file="logs/server.log"

    if [ -f "$log_file" ]; then
        log_info "显示服务日志 (最后50行):"
        echo "=================================="
        tail -50 "$log_file"
        echo "=================================="
        log_info "使用 tail -f $log_file 实时查看日志"
    else
        log_warning "日志文件不存在: $log_file"
    fi
}

# 配置网络访问
configure_network() {
    local port=${1:-$PORT}
    log_info "配置局域网访问..."

    # 获取本机IP地址
    local local_ip=$(hostname -I | awk '{print $1}')

    log_info "本机IP地址: $local_ip"
    log_info "服务端口: $port"

    # 检查是否在WSL环境
    if grep -q "microsoft" /proc/version 2>/dev/null; then
        log_info "检测到WSL环境，配置端口转发..."

        # 显示Windows端口转发命令
        echo ""
        log_warning "请在Windows PowerShell (管理员权限) 中执行以下命令："
        echo "netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$local_ip"
        echo ""
        log_info "删除端口转发的命令："
        echo "netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0"
        echo ""
        log_info "查看现有端口转发："
        echo "netsh interface portproxy show all"
        echo ""
    fi

    # 显示访问信息
    echo "=================================="
    echo "  局域网访问配置信息"
    echo "=================================="
    echo "本地访问: http://localhost:$port"
    echo "局域网访问: http://$local_ip:$port"
    echo ""
    echo "其他设备访问步骤："
    echo "1. 确保设备在同一局域网内"
    echo "2. 在浏览器中输入: http://$local_ip:$port"
    echo "3. 如果无法访问，请检查防火墙设置"
    echo "=================================="
}

# 配置防火墙
configure_firewall() {
    local port=${1:-$PORT}
    log_info "配置防火墙规则..."

    # 检查防火墙类型
    if command -v ufw &> /dev/null; then
        log_info "检测到UFW防火墙"

        # 检查UFW状态
        local ufw_status=$(sudo ufw status | head -1)
        if echo "$ufw_status" | grep -q "inactive"; then
            log_warning "UFW防火墙未启用"
            echo "是否启用UFW防火墙? (y/N)"
            read -r response
            if [[ "$response" =~ ^[Yy]$ ]]; then
                sudo ufw enable
                log_success "UFW防火墙已启用"
            fi
        fi

        # 添加端口规则
        log_info "添加端口 $port 到防火墙规则..."
        sudo ufw allow $port/tcp
        log_success "防火墙规则已添加"

        # 显示防火墙状态
        echo ""
        log_info "当前防火墙状态:"
        sudo ufw status numbered

    elif command -v firewall-cmd &> /dev/null; then
        log_info "检测到firewalld防火墙"

        # 添加端口规则
        sudo firewall-cmd --permanent --add-port=$port/tcp
        sudo firewall-cmd --reload
        log_success "防火墙规则已添加"

        # 显示防火墙状态
        echo ""
        log_info "当前防火墙状态:"
        sudo firewall-cmd --list-ports

    elif command -v iptables &> /dev/null; then
        log_info "检测到iptables防火墙"

        # 添加iptables规则
        sudo iptables -A INPUT -p tcp --dport $port -j ACCEPT
        log_success "iptables规则已添加"

        # 保存规则 (Ubuntu/Debian)
        if command -v iptables-save &> /dev/null; then
            sudo iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
        fi

        log_warning "注意: iptables规则可能在重启后丢失，建议使用ufw或firewalld"

    else
        log_warning "未检测到支持的防火墙，请手动配置防火墙规则"
        echo "需要开放端口: $port/tcp"
    fi

    # WSL特殊说明
    if grep -q "microsoft" /proc/version 2>/dev/null; then
        echo ""
        log_warning "WSL环境额外说明:"
        echo "1. 需要在Windows防火墙中允许端口 $port"
        echo "2. 可能需要配置Windows端口转发"
        echo "3. 使用 ./deploy.sh --network 查看详细配置"
    fi
}

# 清理构建文件
clean_build() {
    log_info "清理构建文件..."

    # 先停止服务
    stop_daemon

    if [ -d "$WEB_DIR" ]; then
        rm -rf "$WEB_DIR"
        log_success "已清理 $WEB_DIR 目录"
    fi

    if [ -d ".venv" ]; then
        rm -rf ".venv"
        log_success "已清理Python虚拟环境"
    fi

    if [ -d "logs" ]; then
        rm -rf "logs"
        log_success "已清理日志目录"
    fi

    log_success "清理完成"
}

# 主函数
main() {
    local port=$PORT
    local dev_mode=false
    local build_only=false
    local start_only=false
    local use_nginx=false
    local use_apache=false
    local clean_only=false
    local daemon_mode=false
    local stop_service=false
    local check_status_only=false
    local show_logs_only=false
    local configure_network_only=false
    local configure_firewall_only=false
    local enable_network_access=false
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -p|--port)
                port="$2"
                shift 2
                ;;
            -d|--dev)
                dev_mode=true
                shift
                ;;
            -b|--build)
                build_only=true
                shift
                ;;
            -s|--start)
                start_only=true
                shift
                ;;
            -c|--clean)
                clean_only=true
                shift
                ;;
            --nginx)
                use_nginx=true
                shift
                ;;
            --apache)
                use_apache=true
                shift
                ;;
            --daemon)
                daemon_mode=true
                shift
                ;;
            --stop)
                stop_service=true
                shift
                ;;
            --status)
                check_status_only=true
                shift
                ;;
            --logs)
                show_logs_only=true
                shift
                ;;
            --network)
                configure_network_only=true
                shift
                ;;
            --firewall)
                configure_firewall_only=true
                shift
                ;;
            -n|--enable-network)
                enable_network_access=true
                shift
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 显示欢迎信息
    echo "=================================="
    echo "  IIR OCOMM 部署脚本 - WSL环境"
    echo "=================================="
    echo ""
    
    # 执行特定操作
    if [ "$clean_only" = true ]; then
        clean_build
        exit 0
    fi

    if [ "$stop_service" = true ]; then
        stop_daemon
        exit 0
    fi

    if [ "$check_status_only" = true ]; then
        check_status
        exit 0
    fi

    if [ "$show_logs_only" = true ]; then
        show_logs
        exit 0
    fi

    if [ "$configure_network_only" = true ]; then
        configure_network "$port"
        exit 0
    fi

    if [ "$configure_firewall_only" = true ]; then
        configure_firewall "$port"
        exit 0
    fi
    
    # 检查环境
    check_wsl_environment
    
    # 构建阶段
    if [ "$start_only" = false ]; then
        install_uv
        setup_python_env
        build_data
        validate_build
    fi
    
    # 仅构建模式
    if [ "$build_only" = true ]; then
        log_success "构建完成，使用 $0 -s 启动服务"
        exit 0
    fi
    
    # 部署阶段
    if [ "$use_nginx" = true ]; then
        deploy_nginx
    elif [ "$use_apache" = true ]; then
        deploy_apache
    else
        # 确定绑定地址
        local bind_address="127.0.0.1"
        if [ "$enable_network_access" = true ]; then
            bind_address="0.0.0.0"
            log_info "启用局域网访问模式"
        fi

        start_dev_server "$port" "$daemon_mode" "$bind_address"
    fi
}

# 捕获中断信号
trap 'log_info "正在停止服务..."; exit 0' INT TERM

# 运行主函数
main "$@"
