/**
 * PDF文件路由处理
 * 处理PDF文件的访问和列表获取
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 扫描PDF文件并建立映射关系
 */
function scanPdfFiles() {
  const pdfList = [];
  
  try {
    // 读取英文PDF目录
    const enFiles = fs.readdirSync(config.pdfEnDir).filter(f => f.endsWith('.pdf'));
    
    // 读取中文PDF目录
    let zhFiles = [];
    if (fs.existsSync(config.pdfZhDir)) {
      zhFiles = fs.readdirSync(config.pdfZhDir).filter(f => f.endsWith('.pdf'));
    }
    
    // 建立映射
    enFiles.forEach(enFile => {
      // 提取前缀数字（如 "001"）
      const match = enFile.match(/^(\d+)_(.+)\.pdf$/);
      if (match) {
        const prefix = match[1];
        const nameWithoutPrefix = match[2];
        
        // 查找对应的中文文件
        const zhFile = zhFiles.find(f => f.startsWith(prefix + '_'));
        
        pdfList.push({
          prefix: prefix,
          name: nameWithoutPrefix,
          enFile: enFile,
          zhFile: zhFile || null,
          enPath: `/pdf/en/${encodeURIComponent(enFile)}`,
          zhPath: zhFile ? `/pdf/zh/${encodeURIComponent(zhFile)}` : null
        });
      }
    });
    
    // 按前缀数字排序
    pdfList.sort((a, b) => parseInt(a.prefix) - parseInt(b.prefix));
    
  } catch (error) {
    console.error('扫描PDF文件失败:', error);
  }
  
  return pdfList;
}

/**
 * 服务PDF文件
 */
function servePdfFile(filePath, res) {
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>404 - PDF未找到</title>
        </head>
        <body>
          <h1>404 - PDF文件未找到</h1>
          <p>请求的PDF文件不存在</p>
        </body>
        </html>
      `);
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>500 - 服务器错误</title>
          </head>
          <body>
            <h1>500 - 服务器错误</h1>
            <p>读取PDF文件时发生错误</p>
          </body>
          </html>
        `);
        return;
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
      });
      res.send(data);
    });
  });
}

// API: 获取PDF列表
router.get('/api/pdf-list', (req, res) => {
  const pdfList = scanPdfFiles();
  res.json(pdfList);
});

// 英文PDF文件
router.get('/pdf/en/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(config.pdfEnDir, filename);
  servePdfFile(filePath, res);
});

// 中文PDF文件
router.get('/pdf/zh/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(config.pdfZhDir, filename);
  servePdfFile(filePath, res);
});

module.exports = router;

