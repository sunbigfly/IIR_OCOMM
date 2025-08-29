#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 配置
const PORT = process.env.PORT || 8000;
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
  '.ico': 'image/x-icon'
};

// 获取文件的 MIME 类型
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // 解析 URL
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // 默认页面
  if (pathname === '/') {
    pathname = '/index.html';
  }
  
  // 构建文件路径
  const filePath = path.join(__dirname, WEB_DIR, pathname);
  
  // 检查文件是否存在
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // 文件不存在，返回 404
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>404 - 页面未找到</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>404 - 页面未找到</h1>
          <p>请求的文件 <code>${pathname}</code> 不存在</p>
          <a href="/">返回首页</a>
        </body>
        </html>
      `);
      return;
    }
    
    // 读取文件
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // 读取错误，返回 500
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>500 - 服务器错误</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <h1>500 - 服务器错误</h1>
            <p>读取文件时发生错误</p>
            <a href="/">返回首页</a>
          </body>
          </html>
        `);
        return;
      }
      
      // 设置响应头
      const mimeType = getMimeType(filePath);
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': pathname.endsWith('.json') ? 'no-cache' : 'public, max-age=3600'
      });
      
      // 发送文件内容
      res.end(data);
    });
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 IIR OCOMM 服务器启动成功!`);
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`📁 服务目录: ${path.resolve(WEB_DIR)}`);
  console.log(`⏹️  按 Ctrl+C 停止服务器`);
  
  // 尝试自动打开浏览器
  const open = (url) => {
    const { exec } = require('child_process');
    const platform = process.platform;
    
    let command;
    if (platform === 'darwin') {
      command = `open ${url}`;
    } else if (platform === 'win32') {
      command = `start ${url}`;
    } else {
      command = `xdg-open ${url}`;
    }
    
    exec(command, (error) => {
      if (error) {
        console.log(`💡 请手动在浏览器中打开: http://localhost:${PORT}`);
      }
    });
  };
  
  // 延迟 1 秒后打开浏览器
  setTimeout(() => {
    open(`http://localhost:${PORT}`);
  }, 1000);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在停止服务器...');
  server.close(() => {
    console.log('✅ 服务器已停止');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 正在停止服务器...');
  server.close(() => {
    console.log('✅ 服务器已停止');
    process.exit(0);
  });
});
