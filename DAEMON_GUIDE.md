# IIR OCOMM 后台运行指南

本指南详细说明如何让IIR OCOMM应用在后台运行，提供多种后台运行方案。

## 🚀 快速后台启动

### 方法一：使用部署脚本 (推荐)

```bash
# 后台启动服务
./deploy.sh --daemon

# 查看服务状态
./deploy.sh --status

# 查看服务日志
./deploy.sh --logs

# 停止后台服务
./deploy.sh --stop
```

### 方法二：使用nohup命令

```bash
# 进入web_app目录
cd web_app

# 后台启动
nohup python3 -m http.server 8000 > ../logs/server.log 2>&1 &

# 记录进程ID
echo $! > ../logs/server.pid

# 查看进程
ps aux | grep "python.*http.server"
```

### 方法三：使用screen会话

```bash
# 安装screen (如果未安装)
sudo apt install screen

# 创建新的screen会话
screen -S iir-ocomm

# 在screen中启动服务
cd web_app
python3 -m http.server 8000

# 分离会话 (按 Ctrl+A, 然后按 D)

# 重新连接会话
screen -r iir-ocomm

# 查看所有会话
screen -ls
```

## 🔧 Systemd 服务 (生产环境推荐)

### 安装systemd服务

```bash
# 使用自动安装脚本
sudo ./install-systemd.sh install

# 或手动安装
sudo cp iir-ocomm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable iir-ocomm
sudo systemctl start iir-ocomm
```

### 管理systemd服务

```bash
# 查看服务状态
sudo systemctl status iir-ocomm

# 启动服务
sudo systemctl start iir-ocomm

# 停止服务
sudo systemctl stop iir-ocomm

# 重启服务
sudo systemctl restart iir-ocomm

# 查看日志
sudo journalctl -u iir-ocomm -f

# 开机自启
sudo systemctl enable iir-ocomm

# 禁用开机自启
sudo systemctl disable iir-ocomm
```

### 卸载systemd服务

```bash
# 使用自动卸载脚本
sudo ./install-systemd.sh uninstall

# 或手动卸载
sudo systemctl stop iir-ocomm
sudo systemctl disable iir-ocomm
sudo rm /etc/systemd/system/iir-ocomm.service
sudo systemctl daemon-reload
```

## 🌐 Nginx/Apache 后台部署

### Nginx部署 (推荐生产环境)

```bash
# 使用部署脚本
./deploy.sh --nginx

# Nginx会自动在后台运行
sudo systemctl status nginx
```

### Apache部署

```bash
# 使用部署脚本
./deploy.sh --apache

# Apache会自动在后台运行
sudo systemctl status apache2
```

## 📊 进程管理

### 查看运行中的服务

```bash
# 查看Python HTTP服务器进程
ps aux | grep "python.*http.server"

# 查看端口占用
netstat -tulnp | grep :8000

# 查看进程树
pstree -p | grep python
```

### 终止后台进程

```bash
# 使用部署脚本停止
./deploy.sh --stop

# 手动终止进程
pkill -f "python.*http.server"

# 根据PID终止
kill $(cat logs/server.pid)

# 强制终止
kill -9 $(cat logs/server.pid)
```

## 📝 日志管理

### 查看日志

```bash
# 使用部署脚本查看日志
./deploy.sh --logs

# 实时查看日志
tail -f logs/server.log

# 查看systemd日志
sudo journalctl -u iir-ocomm -f

# 查看Nginx日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 日志轮转

创建日志轮转配置：

```bash
# 创建logrotate配置
sudo tee /etc/logrotate.d/iir-ocomm << EOF
/opt/iir-ocomm/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload iir-ocomm
    endscript
}
EOF
```

## 🔒 安全配置

### 防火墙设置

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 8000
sudo ufw allow 80
sudo ufw allow 443

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 用户权限

```bash
# 创建专用用户
sudo useradd -r -s /bin/false iir-ocomm

# 设置文件权限
sudo chown -R iir-ocomm:iir-ocomm /opt/iir-ocomm
sudo chmod -R 755 /opt/iir-ocomm
```

## 🚀 开机自启动

### 使用systemd (推荐)

```bash
# 启用开机自启
sudo systemctl enable iir-ocomm

# 验证自启状态
sudo systemctl is-enabled iir-ocomm
```

### 使用crontab

```bash
# 编辑crontab
crontab -e

# 添加开机启动任务
@reboot cd /path/to/IIR_OCOMM && ./deploy.sh --daemon
```

### 使用rc.local

```bash
# 编辑rc.local
sudo nano /etc/rc.local

# 添加启动命令
cd /path/to/IIR_OCOMM && ./deploy.sh --daemon

# 确保rc.local可执行
sudo chmod +x /etc/rc.local
```

## 📈 性能监控

### 系统资源监控

```bash
# 查看CPU和内存使用
top -p $(pgrep -f "python.*http.server")

# 查看详细进程信息
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%cpu | grep python

# 使用htop (更友好的界面)
sudo apt install htop
htop
```

### 网络监控

```bash
# 查看网络连接
ss -tulnp | grep :8000

# 监控网络流量
sudo apt install iftop
sudo iftop -i eth0
```

## 🔧 故障排除

### 常见问题

#### 1. 服务无法启动
```bash
# 检查端口占用
sudo netstat -tulnp | grep :8000

# 检查权限
ls -la /opt/iir-ocomm/

# 查看详细错误
sudo journalctl -u iir-ocomm -n 50
```

#### 2. 服务意外停止
```bash
# 查看系统日志
sudo journalctl -xe

# 检查内存使用
free -h

# 检查磁盘空间
df -h
```

#### 3. 无法访问服务
```bash
# 检查防火墙
sudo ufw status

# 检查服务状态
sudo systemctl status iir-ocomm

# 测试本地连接
curl -I http://localhost:8000
```

## 📋 最佳实践

1. **生产环境使用Nginx/Apache**：提供更好的性能和安全性
2. **使用systemd管理服务**：提供自动重启和日志管理
3. **配置日志轮转**：防止日志文件过大
4. **定期备份数据**：备份Excel文件和配置
5. **监控服务状态**：设置监控告警
6. **安全配置**：使用专用用户运行服务
7. **防火墙配置**：只开放必要的端口

## 📞 技术支持

如果遇到问题，请按以下步骤排查：

1. 检查服务状态：`./deploy.sh --status`
2. 查看日志：`./deploy.sh --logs`
3. 检查端口占用：`netstat -tulnp | grep :8000`
4. 检查防火墙：`sudo ufw status`
5. 重启服务：`./deploy.sh --stop && ./deploy.sh --daemon`

更多帮助请参考项目文档或提交Issue。
