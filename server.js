#!/usr/bin/env node

/**
 * IIR OCOMM 服务器入口文件
 * FDA非活性成分数据库检索系统 + 药用辅料手册检索系统
 */

const os = require('os');
const createApp = require('./src/server/app');
const config = require('./src/server/config');
const logger = require('./src/server/utils/logger');

// 创建Express应用
const app = createApp();

// 启动服务器
const server = app.listen(config.port, config.host, () => {
  // 获取本机IP地址
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

  console.log('\n🚀 IIR OCOMM 服务器启动成功!\n');
  console.log('📍 访问地址:');
  console.log(`   本地:     http://localhost:${config.port}`);
  console.log(`   局域网:   http://${localIP}:${config.port}`);
  console.log('\n📖 应用列表:');
  console.log(`   首页:       http://localhost:${config.port}/`);
  console.log(`   FDA检索:    http://localhost:${config.port}/fda`);
  console.log(`   辅料手册:   http://localhost:${config.port}/handbook`);
  console.log(`   PDF翻译:    http://localhost:${config.port}/translator`);
  console.log(`   Prompt优化: http://localhost:${config.port}/optimizer`);
  console.log('\n⏹️  按 Ctrl+C 停止服务器\n');

  // 尝试自动打开浏览器
  const { exec } = require('child_process');
  const platform = process.platform;

  let command;
  if (platform === 'darwin') {
    command = `open http://localhost:${config.port}`;
  } else if (platform === 'win32') {
    command = `start http://localhost:${config.port}`;
  } else {
    command = `xdg-open http://localhost:${config.port}`;
  }

  setTimeout(() => {
    exec(command, (error) => {
      if (error) {
        logger.info(`请手动在浏览器中打开: http://localhost:${config.port}`);
      }
    });
  }, 1000);
});

// 优雅关闭函数
function gracefulShutdown(signal) {
  logger.info(`收到 ${signal} 信号，正在停止服务器...`);

  const timeout = setTimeout(() => {
    logger.warn('强制退出服务器');
    process.exit(1);
  }, 25000);

  server.close((err) => {
    clearTimeout(timeout);
    if (err) {
      logger.error('服务器关闭错误:', err);
      process.exit(1);
    } else {
      logger.success('服务器已停止');
      process.exit(0);
    }
  });
}

// 注册信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
