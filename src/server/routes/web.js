/**
 * Web页面路由
 * 处理HTML页面的访问
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');

// 统一首页
router.get('/', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'home.html'));
});

// FDA检索系统
router.get('/fda', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'fda/index.html'));
});

// 药用辅料手册页面（保持旧URL兼容）
router.get('/handbook.html', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'handbook/index.html'));
});

// 药用辅料手册页面（新URL）
router.get('/handbook', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'handbook/index.html'));
});

// PDF翻译器页面
router.get('/translator', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'translator/index.html'));
});

// Prompt优化器页面
router.get('/optimizer', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'optimizer/index.html'));
});

// 值日提醒系统页面
router.get('/dutyinfo', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'dutyinfo/index.html'));
});

module.exports = router;

