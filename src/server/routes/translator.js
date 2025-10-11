/**
 * PDF翻译器API路由
 * 处理文件上传和翻译请求
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const logger = require('../utils/logger');

// 配置文件上传 - 存放在 public/translator/uploads 目录
const uploadDir = path.join(__dirname, '../../public/translator/uploads/temp');
const outputDir = path.join(__dirname, '../../public/translator/uploads/translated');

// 服务器端存储 - 每个session的历史记录
// sessionId -> TranslationTask[]
const userHistories = new Map();
const MAX_HISTORY_PER_USER = 1000;

// 确保目录存在
async function ensureDirectories() {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    logger.error('创建目录失败:', error);
  }
}

ensureDirectories();

// 配置 multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 使用纯 ASCII 文件名避免中文问题
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    // 使用 upload_ 前缀 + 唯一ID，避免中文文件名问题
    cb(null, 'upload_' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 限制100MB
  },
  fileFilter: function (req, file, cb) {
    // 只接受PDF文件
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return cb(new Error('只支持PDF文件'));
    }
    cb(null, true);
  }
});

/**
 * 调用 pdf2zh_next 翻译文件
 */
async function translatePDF(inputPath, originalName) {
  return new Promise((resolve, reject) => {
    const timeout = 600000; // 10分钟超时
    
    // 构建命令参数（基于配置文件）
    const args = [
      '--output', outputDir,
      '--lang-in', 'en',
      '--lang-out', 'zh-cn',
      '--siliconflowfree',
      '--no-dual',              // 只生成单语版本
      '--watermark-output-mode', 'no_watermark',
      '--skip-clean',
      '--no-auto-extract-glossary',
      '--qps', '20',
      '--pool-max-workers', '20',
      '--skip-scanned-detection',
      '--skip-formula-offset-calculation',
      inputPath
    ];

    // 正确处理中文文件名编码（WSL2兼容）
    const displayName = Buffer.from(originalName, 'utf8').toString('utf8');
    logger.info(`开始翻译: ${displayName}`);
    logger.info(`临时文件: ${path.basename(inputPath)}`);

    const process = spawn('pdf2zh_next', args);
    
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 设置超时
    const timer = setTimeout(() => {
      process.kill();
      reject(new Error('翻译超时（超过10分钟）'));
    }, timeout);

    process.on('close', async (code) => {
      clearTimeout(timer);
      
      if (code === 0) {
        const displayName = Buffer.from(originalName, 'utf8').toString('utf8');
        logger.info(`翻译成功: ${displayName}`);
        
        // 查找输出文件
        const baseName = path.basename(inputPath, '.pdf');
        const possibleOutputs = [
          path.join(outputDir, `${baseName}.no_watermark.zh-cn.mono.pdf`),  // 小写 zh-cn
          path.join(outputDir, `${baseName}.no_watermark.zh-CN.mono.pdf`),  // 大写 zh-CN
          path.join(outputDir, `${baseName}.zh-cn.mono.pdf`),
          path.join(outputDir, `${baseName}.zh-CN.mono.pdf`),
          path.join(outputDir, `${baseName}.pdf`),
        ];
        
        // 依次检查可能的输出文件
        for (const outputPath of possibleOutputs) {
          try {
            await fs.access(outputPath);
            logger.info(`找到输出文件: ${path.basename(outputPath)}`);
            resolve(outputPath);
            return;
          } catch (err) {
            // 文件不存在，继续检查下一个
          }
        }
        
        // 如果都没找到，尝试列出输出目录看看生成了什么
        try {
          const files = await fs.readdir(outputDir);
          logger.error(`输出目录文件列表: ${files.join(', ')}`);
        } catch (err) {
          // 忽略
        }
        
        reject(new Error('未找到输出文件'));
      } else {
        const displayName = Buffer.from(originalName, 'utf8').toString('utf8');
        logger.error(`翻译失败: ${displayName}, 退出码: ${code}`);
        logger.error(`错误输出: ${stderr}`);
        reject(new Error(`翻译失败: ${stderr || '未知错误'}`));
      }
    });

    process.on('error', (error) => {
      clearTimeout(timer);
      logger.error(`进程错误: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * POST /api/translate
 * 上传并翻译PDF文件
 */
router.post('/api/translate', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: '未上传文件'
    });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;

  try {
    // 检查 pdf2zh_next 是否可用
    const checkProcess = spawn('pdf2zh_next', ['--version']);
    
    await new Promise((resolve, reject) => {
      checkProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('pdf2zh_next 未安装或不可用'));
        } else {
          resolve();
        }
      });
      checkProcess.on('error', () => {
        reject(new Error('pdf2zh_next 未安装或不可用'));
      });
    });

    // 翻译文件
    const outputPath = await translatePDF(inputPath, originalName);
    
    // 生成可访问的URL
    const outputUrl = `/translator/uploads/translated/${path.basename(outputPath)}`;
    const inputUrl = `/translator/uploads/temp/${path.basename(inputPath)}`;

    res.json({
      success: true,
      inputPath: inputUrl,
      outputPath: outputUrl,
      originalName: originalName,
      message: '翻译成功'
    });

  } catch (error) {
    logger.error('翻译错误:', error);
    
    // 清理上传的文件
    try {
      await fs.unlink(inputPath);
    } catch (unlinkError) {
      logger.error('清理文件失败:', unlinkError);
    }

    res.status(500).json({
      success: false,
      error: error.message || '翻译失败'
    });
  }
});

/**
 * POST /api/translate/delete
 * 删除翻译文件
 */
router.post('/api/translate/delete', async (req, res) => {
  const { inputPath, outputPath } = req.body;
  
  const results = {
    input: false,
    output: false,
    errors: []
  };

  try {
    // 删除输入文件
    if (inputPath) {
      try {
        // 从URL路径中提取文件名：/translator/uploads/temp/xxx.pdf -> xxx.pdf
        const fileName = path.basename(inputPath);
        const filePath = path.join(uploadDir, fileName);
        logger.info(`尝试删除输入文件: ${filePath}`);
        await fs.unlink(filePath);
        results.input = true;
        logger.info(`✅ 已删除输入文件: ${fileName}`);
      } catch (error) {
        logger.warn(`❌ 删除输入文件失败: ${inputPath} - ${error.message}`);
        results.errors.push(`输入文件: ${error.message}`);
      }
    }

    // 删除输出文件
    if (outputPath) {
      try {
        // 从URL路径中提取文件名：/translator/uploads/translated/xxx.pdf -> xxx.pdf
        const fileName = path.basename(outputPath);
        const filePath = path.join(outputDir, fileName);
        logger.info(`尝试删除输出文件: ${filePath}`);
        await fs.unlink(filePath);
        results.output = true;
        logger.info(`✅ 已删除输出文件: ${fileName}`);
      } catch (error) {
        logger.warn(`❌ 删除输出文件失败: ${outputPath} - ${error.message}`);
        results.errors.push(`输出文件: ${error.message}`);
      }
    }

    res.json({
      success: true,
      results: results,
      message: '删除完成'
    });

  } catch (error) {
    logger.error('删除文件错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/translate/history
 * 获取当前用户的翻译历史
 */
router.get('/api/translate/history', (req, res) => {
  try {
    const sessionId = req.sessionID;
    const history = userHistories.get(sessionId) || [];
    
    res.json({
      success: true,
      history: history,
      count: history.length
    });
  } catch (error) {
    logger.error('获取历史记录错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/translate/history
 * 保存单条翻译历史
 */
router.post('/api/translate/history', (req, res) => {
  try {
    const sessionId = req.sessionID;
    const task = req.body;
    
    if (!task || !task.id) {
      return res.status(400).json({
        success: false,
        error: '无效的任务数据'
      });
    }
    
    // 获取或创建用户历史
    let history = userHistories.get(sessionId) || [];
    
    // 添加新记录（最新的在前面）
    history.unshift(task);
    
    // 限制历史记录数量
    if (history.length > MAX_HISTORY_PER_USER) {
      history = history.slice(0, MAX_HISTORY_PER_USER);
    }
    
    // 保存
    userHistories.set(sessionId, history);
    
    logger.info(`用户 ${sessionId.substring(0, 8)}... 保存历史记录: ${task.fileName}`);
    
    res.json({
      success: true,
      count: history.length
    });
  } catch (error) {
    logger.error('保存历史记录错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/translate/history/:taskId
 * 删除单条历史记录
 */
router.delete('/api/translate/history/:taskId', (req, res) => {
  try {
    const sessionId = req.sessionID;
    const taskId = req.params.taskId;
    
    let history = userHistories.get(sessionId) || [];
    const originalLength = history.length;
    
    // 过滤掉指定的任务
    history = history.filter(t => t.id !== taskId);
    
    if (history.length === originalLength) {
      return res.status(404).json({
        success: false,
        error: '记录不存在'
      });
    }
    
    // 更新存储
    userHistories.set(sessionId, history);
    
    logger.info(`用户 ${sessionId.substring(0, 8)}... 删除历史记录: ${taskId}`);
    
    res.json({
      success: true,
      count: history.length
    });
  } catch (error) {
    logger.error('删除历史记录错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/translate/history
 * 清空当前用户的所有历史记录
 */
router.delete('/api/translate/history', (req, res) => {
  try {
    const sessionId = req.sessionID;
    
    userHistories.delete(sessionId);
    
    logger.info(`用户 ${sessionId.substring(0, 8)}... 清空所有历史记录`);
    
    res.json({
      success: true,
      message: '历史记录已清空'
    });
  } catch (error) {
    logger.error('清空历史记录错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/translate/health
 * 健康检查：检查 pdf2zh_next 是否可用
 */
router.get('/api/translate/health', async (req, res) => {
  try {
    const process = spawn('pdf2zh_next', ['--version']);
    
    let version = '';
    process.stdout.on('data', (data) => {
      version += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        res.json({
          success: true,
          available: true,
          version: version.trim(),
          message: 'pdf2zh_next 可用'
        });
      } else {
        res.json({
          success: false,
          available: false,
          message: 'pdf2zh_next 不可用'
        });
      }
    });

    process.on('error', () => {
      res.json({
        success: false,
        available: false,
        message: 'pdf2zh_next 未安装'
      });
    });

  } catch (error) {
    res.json({
      success: false,
      available: false,
      message: error.message
    });
  }
});

module.exports = router;

