/**
 * Express应用主文件
 * 配置Express应用和中间件
 */

const express = require('express');
const path = require('path');
const config = require('./config');
const registerRoutes = require('./routes');
const logger = require('./utils/logger');

function createApp() {
  const app = express();

  // 静态文件服务 - common目录（共享资源）
  app.use('/common', express.static(path.join(config.publicDir, 'common'), {
    maxAge: config.cache.static,
    etag: true
  }));

  // 静态文件服务 - fda目录
  app.use('/fda', express.static(path.join(config.publicDir, 'fda'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', config.cache.html);
      } else if (filePath.endsWith('.json')) {
        res.set('Cache-Control', config.cache.json);
      }
    }
  }));

  // 静态文件服务 - handbook目录
  app.use('/handbook', express.static(path.join(config.publicDir, 'handbook'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', config.cache.html);
      }
    }
  }));

  // 注册路由
  registerRoutes(app);

  // 404处理
  app.use((req, res) => {
    res.status(404).send(`
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
        <p>请求的资源 <code>${req.path}</code> 不存在</p>
        <a href="/">返回首页</a>
      </body>
      </html>
    `);
  });

  // 错误处理
  app.use((err, req, res, next) => {
    logger.error('服务器错误:', err);
    res.status(500).send(`
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
        <p>服务器处理请求时发生错误</p>
        <a href="/">返回首页</a>
      </body>
      </html>
    `);
  });

  return app;
}

module.exports = createApp;

