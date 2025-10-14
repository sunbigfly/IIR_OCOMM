# Pharma Toolbox - 医药工具箱

专业的医药信息检索与文档处理平台，包含：
- 📦 FDA 非活性成分数据库检索（15万条记录）
- 📚 药用辅料手册检索（300+份中英文PDF）
- 🌐 PDF 翻译器（基于 pdf2zh-next）
- 🤖 Prompt 优化器（AI提示词优化工具）

## 快速开始

### 开发环境
```bash
# 1. 初始化环境（首次运行）
./service-manager.sh setup

# 2. 启动服务
npm start
```

访问：http://localhost:8000

### 生产环境（systemd 服务）
自动启动所有服务，包括 Prompt Optimizer

```bash
./service-manager.sh setup           # 初始化环境
sudo ./service-manager.sh install    # 安装系统服务
sudo ./service-manager.sh start      # 启动（自动启动 Prompt Optimizer）
./service-manager.sh status          # 查看状态
./service-manager.sh logs            # 查看日志
sudo ./service-manager.sh stop       # 停止所有服务
sudo ./service-manager.sh uninstall  # 卸载
```

## 项目结构

```
IIR_OCOMM/
├── src/server/          # 后端：Express路由 + 配置
│   ├── app.js           # Express应用入口
│   ├── config.js        # 配置文件（端口、路径等）
│   └── routes/          # 模块化路由
│       ├── web.js       # 页面路由
│       ├── api.js       # API路由
│       └── pdf.js       # PDF文件服务
│
├── src/public/          # 前端：纯HTML/CSS/JS
│   ├── fda/             # FDA检索应用
│   │   ├── index.html
│   │   ├── app.js
│   │   └── data/        # data.json (15万条), stats.json
│   └── handbook/        # 辅料手册应用
│       ├── index.html
│       ├── app.js
│       └── data/pdfs/   # en/ (6.5MB), zh/ (357MB)
│
└── server.js            # 启动入口
```

## 功能说明

### 1️⃣ FDA 非活性成分数据库检索
- 多字段搜索（成分名、给药途径、剂型、CAS号、UNII）
- 中英文搜索，支持批量查询（分号分隔）
- Excel导出，每页50条记录
- LocalStorage缓存（首次加载后离线可用）

### 2️⃣ 药用辅料手册检索
- 关键词检索300+份PDF文档
- 中英文双语在线预览
- 按编号/名称索引

### 3️⃣ PDF 翻译器
- 支持多文件批量上传
- 英文→中文智能翻译
- 保留PDF原始排版
- 实时翻译进度显示

### 4️⃣ Prompt 优化器
- 系统/用户提示词双模式
- 高级上下文管理
- 变量与工具支持
- 版本迭代与对比
- 实时测试与历史记录

**注意：** Prompt 优化器需要单独安装，详见下方依赖说明

## 技术架构

**核心理念：能用原生就不引入框架**

```
后端：Node.js + Express
  - 为什么用Express：路由管理清晰，中间件生态成熟
  - 为什么不用Koa/Fastify：没必要，Express够用

前端：原生HTML/CSS/JS
  - 为什么不用React/Vue：15万条数据前端过滤，框架虚拟DOM反而是负担
  - 为什么不用构建工具：没有编译需求，零配置开箱即用
  - 缓存策略：LocalStorage存储data.json，二次访问秒开
```

**数据处理逻辑**
- FDA数据：15万条JSON一次性加载到浏览器，前端做搜索过滤
  - 优点：实现简单，延迟低（本地搜索）
  - 缺点：首次加载慢，吃内存
  - 适用场景：内网环境，用户数<100

- PDF文件：按需加载，浏览器原生预览
  - 357MB中文PDF不做转换，直接服务原文件
  - 文件名映射表（pdf_name_mapping.json）做索引

## 数据字段说明

**FDA非活性成分数据库（156,000条）**
```
INGREDIENT_NAME         成分名称（中英文）
ROUTE                   给药途径（中英文）
DOSAGE_FORM             剂型（中英文）
CAS_NUMBER              CAS号
UNII                    唯一成分标识符
POTENCY_AMOUNT/UNIT     效价数量/单位
MAXIMUM_DAILY_EXPOSURE  最大日暴露量
RECORD_UPDATED          记录更新时间
```

## 环境要求

**基础环境**
- Node.js >= 12.0.0
- 现代浏览器（Chrome/Firefox/Safari/Edge）

**可选依赖（根据功能需要）**

1. **PDF 翻译器** - 需要安装 pdf2zh-next
   ```bash
   pip install uv
   uv tool install --python 3.12 pdf2zh-next
   ```

2. **Prompt 优化器** - 需要单独安装
   ```bash
   # 克隆项目
   git clone https://github.com/linshenkx/prompt-optimizer.git ~/prompt-optimizer
   
   # 安装依赖
   cd ~/prompt-optimizer
   pnpm install
   ```
   
   启动脚本会自动检测并启动，无需手动操作

## 开发配置

**修改配置**
编辑 `src/server/config.js`：
```javascript
port: process.env.PORT || 8000,
host: '0.0.0.0',  // 允许局域网访问
```

**添加新路由**
1. 在 `src/server/routes/` 创建路由文件
2. 在 `routes/index.js` 注册

## 版本历史

**v2.0.0** (当前)
- 重构为模块化架构：Express + 路由分层
- 前后端完全分离
- 配置文件集中管理

**v1.1.1**
- 添加辅料手册检索

**v1.0.0**
- FDA数据库检索

## 技术栈

```
后端：Node.js + Express
前端：HTML + CSS + JavaScript（无框架）
设计：Material Design
```

MIT License
