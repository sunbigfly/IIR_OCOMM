#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 配置
const HTTP_PORT = process.env.PORT || 8000;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const WEB_DIR = 'web_app';

// MIME 类型映射
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

// 读取数据文件
let data = [];
try {
  const dataPath = path.join(__dirname, 'IIR_OCOMM_data.json');
  if (fs.existsSync(dataPath)) {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    data = JSON.parse(rawData);
    console.log(`📊 数据加载成功: ${data.length} 条记录`);
  } else {
    console.log('⚠️  数据文件不存在，将返回空数据');
  }
} catch (error) {
  console.error('❌ 数据文件加载失败:', error.message);
}

// 请求处理函数
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API路由
  if (pathname === '/api/data') {
    handleDataAPI(req, res, parsedUrl.query);
    return;
  }

  // 静态文件服务
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(WEB_DIR, filePath);
  
  // 安全检查：防止目录遍历
  const resolvedPath = path.resolve(filePath);
  const webDirPath = path.resolve(WEB_DIR);
  if (!resolvedPath.startsWith(webDirPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // 检查文件是否存在
  fs.access(resolvedPath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    // 获取文件扩展名和MIME类型
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // 设置缓存头
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // 读取并发送文件
    fs.readFile(resolvedPath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
        return;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

// 数据API处理
function handleDataAPI(req, res, query) {
  try {
    let filteredData = [...data];

    // 应用搜索过滤器
    if (query.ingredient_name) {
      const searchTerm = query.ingredient_name.toLowerCase();
      filteredData = filteredData.filter(item => 
        item.INGREDIENT_NAME && item.INGREDIENT_NAME.toLowerCase().includes(searchTerm)
      );
    }

    if (query.route) {
      filteredData = filteredData.filter(item => 
        item.ROUTE && item.ROUTE.toLowerCase().includes(query.route.toLowerCase())
      );
    }

    if (query.dosage_form) {
      filteredData = filteredData.filter(item => 
        item.DOSAGE_FORM && item.DOSAGE_FORM.toLowerCase().includes(query.dosage_form.toLowerCase())
      );
    }

    if (query.cas_number) {
      filteredData = filteredData.filter(item => 
        item.CAS_NUMBER && item.CAS_NUMBER.toLowerCase().includes(query.cas_number.toLowerCase())
      );
    }

    if (query.unii) {
      filteredData = filteredData.filter(item => 
        item.UNII && item.UNII.toLowerCase().includes(query.unii.toLowerCase())
      );
    }

    // 分页
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedData = filteredData.slice(startIndex, endIndex);

    const response = {
      data: paginatedData,
      total: filteredData.length,
      page: page,
      limit: limit,
      totalPages: Math.ceil(filteredData.length / limit)
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(response));

  } catch (error) {
    console.error('API错误:', error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '服务器内部错误' }));
  }
}

// 创建HTTP服务器
const httpServer = http.createServer(handleRequest);

// 创建HTTPS服务器（如果证书存在）
let httpsServer = null;
try {
  const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'server.crt'))
  };
  httpsServer = https.createServer(sslOptions, handleRequest);
} catch (error) {
  console.log('⚠️  SSL证书未找到，仅启动HTTP服务器');
}

// 启动服务器
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  // 获取本机IP地址
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  // 查找第一个非回环的IPv4地址
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  
  console.log(`🚀 IIR OCOMM 服务器启动成功!`);
  console.log(`📍 HTTP访问: http://localhost:${HTTP_PORT}`);
  console.log(`🌐 局域网HTTP: http://${localIP}:${HTTP_PORT}`);
  
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 HTTPS访问: https://localhost:${HTTPS_PORT}`);
      console.log(`🌐 局域网HTTPS: https://${localIP}:${HTTPS_PORT}`);
    });
  }
  
  console.log(`📁 服务目录: ${path.resolve(WEB_DIR)}`);
  console.log(`⏹️  按 Ctrl+C 停止服务器`);
  console.log(`💡 请手动在浏览器中打开: http://localhost:${HTTP_PORT}`);
});
