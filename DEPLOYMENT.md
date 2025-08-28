# IIR OCOMM 部署指南 - WSL环境

本文档详细说明如何在WSL (Windows Subsystem for Linux) 环境中部署IIR OCOMM非活性成分数据检索系统。

## 🚀 快速开始

### 方法一：使用自动化脚本 (推荐)

#### 在WSL中直接运行
```bash
# 完整部署并启动开发服务器
./deploy.sh

# 指定端口
./deploy.sh -p 3000

# 开发模式 (自动重启)
./deploy.sh -d

# 使用Nginx部署
./deploy.sh --nginx
```

#### 在Windows中通过WSL运行
```cmd
REM 完整部署
deploy.bat

REM 指定端口
deploy.bat -p 3000

REM 使用Nginx部署
deploy.bat --nginx

REM 设置WSL环境
deploy.bat --wsl-setup
```

### 方法二：手动部署

```bash
# 1. 安装uv包管理器
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.cargo/env

# 2. 初始化项目
uv init --no-readme
uv add pandas openpyxl

# 3. 转换数据
uv run python convert_excel_to_json.py
uv run python fix_json.py

# 4. 启动服务
cd web_app
python3 -m http.server 8000
```

## 📋 部署选项

### 开发服务器 (默认)
- **优点**：简单快速，适合开发和测试
- **缺点**：性能有限，不适合生产环境
- **命令**：`./deploy.sh` 或 `deploy.bat`

### Nginx部署
- **优点**：高性能，支持gzip压缩，适合生产环境
- **缺点**：配置相对复杂
- **命令**：`./deploy.sh --nginx` 或 `deploy.bat --nginx`

### Apache部署
- **优点**：功能丰富，配置灵活
- **缺点**：资源占用较高
- **命令**：`./deploy.sh --apache` 或 `deploy.bat --apache`

## 🔧 脚本参数说明

### deploy.sh (Linux/WSL)
```bash
./deploy.sh [选项]

选项:
  -h, --help     显示帮助信息
  -p, --port     指定端口号 (默认: 8000)
  -d, --dev      开发模式 (自动重启)
  -b, --build    仅构建，不启动服务
  -s, --start    仅启动服务，不重新构建
  -c, --clean    清理构建文件
  --nginx        使用Nginx部署
  --apache       使用Apache部署
```

### deploy.bat (Windows)
```cmd
deploy.bat [选项]

选项:
  -h, --help     显示帮助信息
  -p, --port     指定端口号 (默认: 8000)
  -d, --dev      开发模式
  -b, --build    仅构建，不启动服务
  -s, --start    仅启动服务，不重新构建
  -c, --clean    清理构建文件
  --nginx        使用Nginx部署
  --apache       使用Apache部署
  --wsl-setup    设置WSL环境
```

## 🌐 访问方式

部署完成后，可以通过以下方式访问：

### 开发服务器
- **本地访问**：http://localhost:8000
- **WSL访问**：http://[WSL-IP]:8000
- **网络访问**：http://[你的IP]:8000 (需要防火墙允许)

### Nginx/Apache
- **本地访问**：http://localhost
- **WSL访问**：http://[WSL-IP]
- **网络访问**：http://[你的IP] (需要防火墙允许)

## 🔍 故障排除

### 常见问题

#### 1. WSL未安装或未启用
```cmd
# 在PowerShell (管理员) 中运行
wsl --install
```

#### 2. 端口被占用
```bash
# 查看端口占用
netstat -tuln | grep :8000

# 终止占用进程
pkill -f "python.*http.server.*8000"
```

#### 3. 权限问题
```bash
# 给脚本添加执行权限
chmod +x deploy.sh

# 如果需要sudo权限
sudo ./deploy.sh --nginx
```

#### 4. Python依赖问题
```bash
# 重新安装依赖
uv sync --reinstall

# 或使用系统Python
sudo apt install python3-pandas python3-openpyxl
```

#### 5. 数据文件问题
```bash
# 检查Excel文件是否存在
ls -la *.xlsx

# 重新生成数据文件
./deploy.sh --clean
./deploy.sh --build
```

### 日志查看

#### 开发服务器日志
服务器日志会直接显示在终端中。

#### Nginx日志
```bash
# 访问日志
sudo tail -f /var/log/nginx/access.log

# 错误日志
sudo tail -f /var/log/nginx/error.log
```

#### Apache日志
```bash
# 访问日志
sudo tail -f /var/log/apache2/access.log

# 错误日志
sudo tail -f /var/log/apache2/error.log
```

## 🔒 安全配置

### 防火墙设置

#### Windows防火墙
1. 打开"Windows Defender 防火墙"
2. 点击"允许应用或功能通过Windows Defender防火墙"
3. 添加端口规则允许8000端口（或你指定的端口）

#### WSL防火墙 (如果启用了ufw)
```bash
# 允许特定端口
sudo ufw allow 8000

# 允许HTTP
sudo ufw allow 80

# 查看状态
sudo ufw status
```

### 网络访问配置

#### 端口转发 (如需要外网访问)
```cmd
# Windows中设置端口转发
netsh interface portproxy add v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=[WSL-IP]
```

## 📊 性能优化

### Nginx优化配置
```nginx
# 启用gzip压缩
gzip on;
gzip_types text/plain text/css application/json application/javascript;

# 设置缓存
location ~* \.(js|css|json)$ {
    expires 1h;
    add_header Cache-Control "public, immutable";
}
```

### 数据文件优化
```bash
# 压缩JSON文件
gzip -k web_app/data.json

# 使用CDN (如果部署到生产环境)
# 将静态文件上传到CDN并修改HTML中的引用
```

## 🚀 生产环境部署

### 使用Docker (可选)
```dockerfile
FROM nginx:alpine
COPY web_app/ /usr/share/nginx/html/
EXPOSE 80
```

### 使用云服务
1. **阿里云OSS**：上传web_app文件夹到OSS，启用静态网站托管
2. **腾讯云COS**：类似OSS的配置
3. **GitHub Pages**：推送到GitHub仓库，启用Pages功能
4. **Netlify/Vercel**：直接拖拽web_app文件夹部署

## 📝 维护说明

### 更新数据
```bash
# 1. 替换Excel文件
cp new_data.xlsx IIR_OCOMM-非活性成分字段描述.xlsx

# 2. 重新构建
./deploy.sh --clean
./deploy.sh --build

# 3. 重启服务
./deploy.sh --start
```

### 备份数据
```bash
# 备份原始数据
cp IIR_OCOMM-非活性成分字段描述.xlsx backup/

# 备份构建结果
tar -czf backup/web_app_$(date +%Y%m%d).tar.gz web_app/
```

## 📞 技术支持

如遇到问题，请检查：
1. WSL环境是否正常
2. Python环境是否正确安装
3. 网络连接是否正常
4. 防火墙设置是否正确
5. 端口是否被占用

更多技术细节请参考项目README.md文件。
