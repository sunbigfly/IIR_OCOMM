# 辅料手册检索系统优化说明

## 更新时间
2025-10-11

## 优化内容

### 1. 支持中英文模糊搜索
- ✅ 后端加载 `pdf_name_mapping.json` 映射文件
- ✅ API返回数据中增加 `chineseName` 字段
- ✅ 前端搜索逻辑支持中文关键词匹配
- ✅ 支持批量搜索（分号分隔）

### 2. 表格显示优化
**原格式：**
```
[编号] [英文名称] [英文PDF按钮] [中文PDF按钮]
```

**新格式：**
```
[编号] [英文名称]      [英文PDF按钮]
      [中文名称]      [中文PDF按钮]
```

### 3. 搜索示例

**英文搜索：**
- `Acacia` → 找到 "Acacia (阿拉伯胶（金合欢胶）)"
- `Starch` → 找到所有含 "Starch" 的条目

**中文搜索：**
- `阿拉伯胶` → 找到 "Acacia (阿拉伯胶（金合欢胶）)"
- `淀粉` → 找到所有含 "淀粉" 的条目
- `金合欢` → 找到 "Acacia (阿拉伯胶（金合欢胶）)"

**批量搜索：**
- `Acacia; 淀粉; 纤维素` → 同时搜索三个关键词

## 技术实现

### 修改文件清单
1. `src/server/routes/pdf.js` - 加载中文映射，注入数据
2. `src/public/handbook/app.js` - 搜索逻辑、显示逻辑
3. `src/public/handbook/index.html` - 界面文案
4. `src/public/common/styles/main.css` - 样式适配

### 核心改动

#### 后端 (pdf.js)
```javascript
// 启动时加载映射文件
const mappingPath = path.join(config.dataDir, 'pdfs/pdf_name_mapping.json');
chineseNameMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// 注入中文名称
const chineseName = chineseNameMapping[enFile] || '';
pdfList.push({
  ...
  chineseName: chineseName,
  ...
});
```

#### 前端搜索 (app.js)
```javascript
// 搜索文本中包含中文名称
const searchText = `${pdf.prefix} ${pdf.name} ${pdf.enFile} ${pdf.chineseName || ''}`.toLowerCase();
return keywords.some(kw => searchText.includes(kw));
```

#### 前端显示 (app.js)
```javascript
// 双行显示英文和中文
<div class="handbook-names">
  <div class="handbook-name-en">${escapeHtml(pdf.name)}</div>
  ${chineseName ? `<div class="handbook-name-zh">${escapeHtml(chineseName)}</div>` : ''}
</div>
```

## 测试验证

### API测试
```bash
curl http://localhost:8000/api/pdf-list | jq '.[0]'
```

**返回结果示例：**
```json
{
  "prefix": "001",
  "name": "Contents",
  "chineseName": "目录",
  "enFile": "001_Contents.pdf",
  "zhFile": "001_Contents.no_watermark.zh-cn.mono.pdf",
  "enPath": "/pdf/en/001_Contents.pdf",
  "zhPath": "/pdf/zh/001_Contents.no_watermark.zh-cn.mono.pdf"
}
```

### 浏览器测试
1. 访问 `http://localhost:8000/handbook`
2. 测试英文搜索：输入 `Acacia`
3. 测试中文搜索：输入 `阿拉伯胶`
4. 测试批量搜索：输入 `Acacia; 淀粉; 纤维素`
5. 验证表格显示：检查是否正确显示中英文双行

## 兼容性说明
- ✅ 向后兼容：如果某个PDF没有中文名称，不影响显示
- ✅ 零破坏性：不影响现有功能
- ✅ 响应式：支持桌面、平板、手机端

## Linus 哲学体现
- **简洁性**：只增加一个字段，不改变核心架构
- **实用性**：解决真实问题（用户需要中文搜索）
- **零破坏**：完全向后兼容，不破坏任何现有功能
- **数据优先**：通过优化数据结构解决问题，而非复杂逻辑

