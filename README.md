# IIR OCOMM - 医药信息检索系统

一个简洁高效的医药信息检索平台，包含两个核心应用：
- **FDA 非活性成分数据库检索系统**
- **药用辅料手册检索系统**

## 🚀 快速开始

### 方式一：使用 Node.js（推荐）

```bash
# 安装依赖（首次运行）
npm install

# 启动服务器
npm start

# 或者直接运行
node server.js

# 指定端口
PORT=3000 npm start
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

## 📁 项目结构

```
IIR_OCOMM/
├── src/                          # 源代码目录
│   ├── server/                   # 后端代码
│   │   ├── app.js               # Express应用主文件
│   │   ├── config.js            # 配置管理
│   │   ├── routes/              # 路由模块
│   │   │   ├── index.js         # 路由注册
│   │   │   ├── web.js           # 页面路由
│   │   │   ├── api.js           # API路由
│   │   │   └── pdf.js           # PDF文件路由
│   │   └── utils/               # 工具函数
│   │       └── logger.js        # 日志工具
│   │
│   └── public/                   # 静态资源（前端）
│       ├── common/               # 共享资源
│       │   ├── styles/          # 共享样式
│       │   │   └── main.css
│       │   ├── images/          # 共享图片
│       │   │   └── favicon.ico
│       │   └── data/            # 共享数据
│       │       └── field_mapping.json
│       │
│       ├── fda/                  # FDA检索应用
│       │   ├── index.html       # 主页面
│       │   ├── app.js           # 应用逻辑
│       │   └── data/            # 数据文件
│       │       ├── data.json    # 非活性成分数据（~15万条）
│       │       └── stats.json   # 统计信息
│       │
│       └── handbook/             # 辅料手册应用
│           ├── index.html       # 主页面
│           └── app.js           # 应用逻辑
│
├── data/                         # 数据文件目录
│   └── pdfs/                    # PDF文档
│       ├── en/                  # 英文PDF（6.5MB+）
│       └── zh/                  # 中文PDF（357MB+）
│
├── server.js                     # 服务器入口
├── package.json                  # 项目配置
└── README.md                     # 项目说明
```

## 🌟 功能特性

### FDA 非活性成分数据库检索

- **多字段搜索**：支持成分名称、给药途径、剂型、CAS号、UNII等多字段搜索
- **中英文支持**：完整的中英文对照和搜索支持
- **批量搜索**：支持分号分隔的批量搜索
- **智能缓存**：本地缓存机制，提高加载速度
- **数据导出**：支持搜索结果导出为Excel格式
- **分页浏览**：每页50条记录，流畅浏览大量数据
- **移动端友好**：响应式设计，支持手机和平板访问

### 药用辅料手册检索

- **文档检索**：支持英文关键词模糊搜索
- **双语PDF**：提供中英文双语PDF文档
- **在线预览**：浏览器内直接预览PDF文档
- **快速访问**：按编号和名称组织，便于查找

## 🔧 技术架构

### 后端
- **Node.js**: 运行时环境
- **Express.js**: Web框架
- **模块化路由**: 清晰的路由分层
- **配置集中管理**: 统一的配置文件

### 前端
- **原生JavaScript**: 无框架依赖，轻量高效
- **原生CSS**: Google Material Design风格
- **SheetJS**: Excel导出功能
- **LocalStorage**: 智能缓存机制

### 架构特点
- **前后端分离**: 静态资源与API服务解耦
- **模块化设计**: 清晰的目录结构和职责划分
- **零构建工具**: 无需Webpack/Vite，开箱即用
- **RESTful API**: 标准的API设计

## 🌐 访问方式

启动服务器后，可通过以下方式访问：

- **统一首页**: http://localhost:8000/
- **FDA检索系统**: http://localhost:8000/fda
- **辅料手册检索**: http://localhost:8000/handbook
- **局域网访问**: http://[你的IP地址]:8000

## 📊 数据说明

### FDA非活性成分数据库

数据库包含约 **156,000** 条 FDA 非活性成分记录，字段包括：

- **INGREDIENT_NAME**: 成分名称（英文/中文）
- **ROUTE**: 给药途径（英文/中文）
- **DOSAGE_FORM**: 剂型（英文/中文）
- **CAS_NUMBER**: CAS 号
- **UNII**: 唯一成分标识符
- **POTENCY_AMOUNT/UNIT**: 效价数量/单位
- **MAXIMUM_DAILY_EXPOSURE**: 最大日暴露量
- **RECORD_UPDATED**: 记录更新时间

### 药用辅料手册

提供约 **300+** 份辅料相关文档：

- 英文原版PDF（总计约6.5MB）
- 中文翻译PDF（总计约357MB）
- 按编号和名称组织

## 🛠️ 开发说明

### 环境要求

- **Node.js**: >= 12.0.0
- **浏览器**: 支持现代浏览器（Chrome、Firefox、Safari、Edge）
- **操作系统**: Windows、macOS、Linux

### 修改端口

```bash
# 通过环境变量
PORT=3000 npm start

# 或编辑 src/server/config.js
```

### 添加新路由

在 `src/server/routes/` 目录下创建新的路由文件，然后在 `routes/index.js` 中注册。

### 自定义配置

编辑 `src/server/config.js` 文件：

```javascript
const config = {
  port: process.env.PORT || 8000,
  host: process.env.HOST || '0.0.0.0',
  // 其他配置...
};
```

## 🔄 系统服务管理

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

### v2.0.0 (当前版本)
- ✨ 重构项目架构，采用模块化设计
- ✨ 引入Express框架，替代原生http server
- ✨ 前后端完全分离，清晰的目录结构
- ✨ 路由模块化，代码更易维护
- ✨ 配置集中管理，支持环境变量
- 📦 重组文件结构，FDA和Handbook独立
- 📦 统一资源路径，共享公共组件
- 🐛 优化PDF文件管理和访问

### v1.1.1
- 添加药用辅料手册检索功能
- 支持中英文双语PDF查看
- 优化移动端显示效果

### v1.0.0
- 初始版本
- FDA非活性成分数据库检索
- 支持多字段搜索和数据导出

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请创建 Issue 或联系开发者。

---

**技术栈**: Node.js + Express.js + 原生JavaScript + 原生CSS  
**架构模式**: 前后端分离 + 模块化设计  
**设计风格**: Google Material Design
