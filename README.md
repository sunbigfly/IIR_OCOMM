# IIR OCOMM - 非活性成分数据检索系统

一个简单易用的 FDA 非活性成分数据库检索系统，支持中英文搜索，移动端友好。

## 🚀 快速开始

### 方式一：使用 Node.js（推荐）

```bash
# 启动服务器
node server.js

# 或者使用 npm
npm start

# 指定端口
PORT=3000 node server.js
```

### 方式二：注册为系统服务（推荐用于生产环境）

```bash
# 安装系统服务
sudo ./service-manager.sh install

# 启动服务
sudo ./service-manager.sh start

# 查看服务状态
./service-manager.sh status

# 查看服务日志
./service-manager.sh logs

# 停止服务
sudo ./service-manager.sh stop

# 卸载服务
sudo ./service-manager.sh uninstall
```

### 方式三：使用 Python（备用）

```bash
# 进入 web_app 目录
cd web_app

# 启动 Python HTTP 服务器
python3 -m http.server 8000
```

## 📁 项目结构

```
IIR_OCOMM/
├── web_app/                 # 前端文件目录
│   ├── index.html          # 主页面
│   ├── styles.css          # 样式文件
│   ├── script.js           # JavaScript 脚本
│   ├── data.json           # 数据文件（约15万条记录）
│   ├── field_mapping.json  # 字段映射配置
│   └── stats.json          # 统计信息
├── server.js               # Node.js 服务器
├── package.json            # Node.js 项目配置
├── service-manager.sh      # 系统服务管理脚本
└── README.md               # 项目说明
```

## 🌟 功能特性

- **多字段搜索**：支持成分名称、给药途径、剂型等多字段搜索
- **中英文支持**：完整的中英文对照和搜索支持
- **移动端友好**：响应式设计，支持手机和平板访问
- **实时搜索**：输入即搜索，无需点击搜索按钮
- **数据导出**：支持搜索结果导出为 CSV 格式
- **统计信息**：显示数据库统计信息和搜索结果统计

## 🔧 系统要求

- **Node.js**: 12.0.0 或更高版本
- **浏览器**: 支持现代浏览器（Chrome、Firefox、Safari、Edge）
- **操作系统**: Windows、macOS、Linux

## 📊 数据说明

数据库包含约 **156,000** 条 FDA 非活性成分记录，包含以下字段：

- **INGREDIENT_NAME**: 成分名称（英文）
- **INGREDIENT_NAME(中文名)**: 成分名称（中文）
- **ROUTE**: 给药途径（英文）
- **ROUTE(中文名)**: 给药途径（中文）
- **DOSAGE_FORM**: 剂型（英文）
- **DOSAGE_FORM(中文名)**: 剂型（中文）
- **CAS_NUMBER**: CAS 号
- **UNII**: 唯一成分标识符
- **POTENCY_AMOUNT**: 效价数量
- **POTENCY_UNIT**: 效价单位
- **MAXIMUM_DAILY_EXPOSURE**: 最大日暴露量
- **RECORD_UPDATED**: 记录更新时间

## 🌐 访问方式

启动服务器后，可通过以下方式访问：

- **本地访问**: http://localhost:8000
- **局域网访问**: http://[你的IP地址]:8000

## 🛠️ 开发说明

### 修改端口

可以通过环境变量修改端口：

```bash
PORT=3000 node server.js
```

### 自定义配置

编辑 `server.js` 文件中的配置部分：

```javascript
const PORT = process.env.PORT || 8000;
const WEB_DIR = 'web_app';
```

### 系统服务管理

系统服务安装后会：
- 自动开机启动
- 在服务异常退出时自动重启
- 将日志输出到系统日志
- 以当前用户身份运行
- 默认监听 8000 端口

服务文件位置：`/etc/systemd/system/iir-ocomm.service`

### 服务管理命令

```bash
# 查看所有可用命令
./service-manager.sh help

# 安装服务（需要 sudo）
sudo ./service-manager.sh install

# 启动/停止/重启服务（需要 sudo）
sudo ./service-manager.sh start
sudo ./service-manager.sh stop
sudo ./service-manager.sh restart

# 查看状态和日志（无需 sudo）
./service-manager.sh status
./service-manager.sh logs

# 卸载服务（需要 sudo）
sudo ./service-manager.sh uninstall
```

## 📝 更新日志

### v1.0.0
- 简化项目结构，移除 Python 依赖
- 使用 Node.js 提供静态文件服务
- 直接使用预处理的 data.json 文件
- 优化启动流程和用户体验

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请创建 Issue 或联系开发者。
