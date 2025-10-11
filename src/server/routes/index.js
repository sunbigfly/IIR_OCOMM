/**
 * 路由注册中心
 * 统一管理所有路由模块
 */

const webRoutes = require('./web');
const pdfRoutes = require('./pdf');
const translatorRoutes = require('./translator');

function registerRoutes(app) {
  // 注册路由模块
  app.use(webRoutes);
  app.use(pdfRoutes);
  app.use(translatorRoutes);
}

module.exports = registerRoutes;

