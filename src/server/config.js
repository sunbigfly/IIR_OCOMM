/**
 * 服务器配置管理
 * 集中管理所有配置项，避免硬编码
 */

const path = require('path');

const config = {
  // 服务器配置
  port: process.env.PORT || 8000,
  host: process.env.HOST || '0.0.0.0',
  
  // 目录配置
  publicDir: path.join(__dirname, '../public'),
  
  // Handbook PDF文件目录
  pdfEnDir: path.join(__dirname, '../public/handbook/data/pdfs/en'),
  pdfZhDir: path.join(__dirname, '../public/handbook/data/pdfs/zh'),
  pdfMappingPath: path.join(__dirname, '../public/handbook/data/pdfs/pdf_name_mapping.json'),
  
  // 缓存配置
  cache: {
    html: 'no-cache, no-store, must-revalidate',
    json: 'no-cache',
    static: 'public, max-age=31536000, immutable'
  },
  
  // MIME类型映射
  mimeTypes: {
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
    '.pdf': 'application/pdf'
  }
};

module.exports = config;

