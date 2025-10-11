/**
 * Web页面路由
 * 处理HTML页面的访问
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');

// FDA检索首页
router.get('/', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'fda/index.html'));
});

// 药用辅料手册页面
router.get('/handbook.html', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'handbook/index.html'));
});

module.exports = router;

