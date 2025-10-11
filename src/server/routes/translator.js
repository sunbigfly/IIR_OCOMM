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
const { requireAuth } = require('../middleware/auth');

// 配置文件上传 - 按用户工号隔离
const uploadsBaseDir = path.join(__dirname, '../../public/translator/uploads');
const historyBaseDir = path.join(__dirname, '../../public/translator/data/history');

const MAX_HISTORY_PER_USER = 1000;

// 全局进程管理 - 存储运行中的翻译进程
// key: requestId, value: { process, inputPath, employeeId, startTime }
const runningProcesses = new Map();

/**
 * 获取用户专属目录路径
 */
function getUserUploadDir(employeeId) {
  return path.join(uploadsBaseDir, employeeId, 'temp');
}

function getUserOutputDir(employeeId) {
  return path.join(uploadsBaseDir, employeeId, 'translated');
}

function getUserHistoryFile(employeeId) {
  return path.join(historyBaseDir, `${employeeId}.json`);
}

/**
 * 确保用户目录存在
 */
async function ensureUserDirectories(employeeId) {
  try {
    await fs.mkdir(getUserUploadDir(employeeId), { recursive: true });
    await fs.mkdir(getUserOutputDir(employeeId), { recursive: true });
    await fs.mkdir(historyBaseDir, { recursive: true });
  } catch (error) {
    logger.error('创建用户目录失败:', error);
  }
}

/**
 * 读取用户历史记录
 */
async function loadUserHistory(employeeId) {
  const filePath = getUserHistoryFile(employeeId);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 文件不存在或解析失败，返回空数组
    return [];
  }
}

/**
 * 保存用户历史记录
 */
async function saveUserHistory(employeeId, history) {
  const filePath = getUserHistoryFile(employeeId);
  try {
    await fs.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    logger.error('保存历史记录失败:', error);
    throw error;
  }
}

// 配置 multer - 动态存储
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const employeeId = req.employeeId;
    if (!employeeId) {
      return cb(new Error('未认证'));
    }
    
    const uploadDir = getUserUploadDir(employeeId);
    await ensureUserDirectories(employeeId);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 使用纯 ASCII 文件名避免中文问题
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
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
 * @param {string} requestId - 请求唯一ID，用于管理进程
 * @param {string} inputPath - 输入文件路径
 * @param {string} originalName - 原始文件名
 * @param {string} outputDir - 输出目录
 * @param {string} employeeId - 用户工号
 */
async function translatePDF(requestId, inputPath, originalName, outputDir, employeeId) {
  return new Promise((resolve, reject) => {
    const timeout = 600000; // 10分钟超时
    
    // 构建命令参数
    const args = [
      '--output', outputDir,
      '--lang-in', 'en',
      '--lang-out', 'zh-cn',
      '--siliconflowfree',
      '--no-dual',
      '--watermark-output-mode', 'no_watermark',
      '--skip-clean',
      '--no-auto-extract-glossary',
      '--qps', '20',
      '--pool-max-workers', '20',
      '--skip-scanned-detection',
      '--skip-formula-offset-calculation',
      inputPath
    ];

    const displayName = Buffer.from(originalName, 'utf8').toString('utf8');
    logger.info(`[${requestId}] 开始翻译: ${displayName}`);
    logger.info(`[${requestId}] 临时文件: ${path.basename(inputPath)}`);

    const childProcess = spawn('pdf2zh_next', args);
    
    // 将进程信息存入全局 Map
    runningProcesses.set(requestId, {
      process: childProcess,
      inputPath,
      employeeId,
      startTime: Date.now(),
      originalName
    });
    
    let stdout = '';
    let stderr = '';
    let isCancelled = false;

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 设置超时
    const timer = setTimeout(async () => {
      logger.warn(`[${requestId}] 翻译超时，强制终止进程`);
      childProcess.kill('SIGKILL');
      runningProcesses.delete(requestId);
      
      // 清理临时文件
      try {
        await fs.unlink(inputPath);
        logger.info(`[${requestId}] 超时后已清理临时文件`);
      } catch (err) {
        logger.warn(`[${requestId}] 清理临时文件失败: ${err.message}`);
      }
      
      const timeoutError = new Error('翻译超时（超过10分钟）');
      timeoutError.fileCleaned = true;
      reject(timeoutError);
    }, timeout);

    childProcess.on('close', async (code) => {
      clearTimeout(timer);
      runningProcesses.delete(requestId);
      
      // 如果是被取消的（退出码为 null 或 SIGTERM/SIGKILL）
      if (code === null || code > 128) {
        logger.info(`[${requestId}] 翻译被取消或终止`);
        // 清理临时文件
        try {
          await fs.unlink(inputPath);
          logger.info(`[${requestId}] 已清理临时文件`);
        } catch (err) {
          logger.warn(`[${requestId}] 清理临时文件失败: ${err.message}`);
        }
        // 使用特殊错误标记，告诉外层不要再清理
        const cancelError = new Error('翻译已取消');
        cancelError.fileCleaned = true; // 标记文件已清理
        reject(cancelError);
        return;
      }
      
      if (code === 0) {
        const displayName = Buffer.from(originalName, 'utf8').toString('utf8');
        logger.info(`翻译成功: ${displayName}`);
        
        // 查找输出文件 - 处理大小写扩展名问题
        const inputFileName = path.basename(inputPath);
        // 使用正则去掉扩展名（不区分大小写）
        const baseName = inputFileName.replace(/\.(pdf|PDF)$/i, '');
        
        const possibleOutputs = [
          path.join(outputDir, `${baseName}.no_watermark.zh-cn.mono.pdf`),
          path.join(outputDir, `${baseName}.no_watermark.zh-CN.mono.pdf`),
          path.join(outputDir, `${baseName}.zh-cn.mono.pdf`),
          path.join(outputDir, `${baseName}.zh-CN.mono.pdf`),
          path.join(outputDir, `${baseName}.pdf`),
        ];
        
        logger.info(`查找输出文件，baseName: ${baseName}`);
        
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
          logger.error(`❌ 未找到预期的输出文件`);
          logger.error(`baseName: ${baseName}`);
          logger.error(`预期: ${baseName}.no_watermark.zh-cn.mono.pdf`);
          logger.error(`输出目录所有文件: ${files.join(', ')}`);
        } catch (err) {
          logger.error(`读取输出目录失败: ${err.message}`);
        }
        
        reject(new Error('未找到输出文件'));
      } else {
        const displayName = Buffer.from(originalName, 'utf8').toString('utf8');
        logger.error(`翻译失败: ${displayName}, 退出码: ${code}`);
        logger.error(`错误输出: ${stderr}`);
        reject(new Error(`翻译失败: ${stderr || '未知错误'}`));
      }
    });

    childProcess.on('error', (error) => {
      clearTimeout(timer);
      runningProcesses.delete(requestId);
      logger.error(`[${requestId}] 进程错误: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * POST /api/translate
 * 上传并翻译PDF文件（需要认证）
 */
router.post('/api/translate', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: '未上传文件'
    });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const employeeId = req.employeeId;
  
  // 使用前端传来的 requestId，如果没有则生成
  const requestId = req.body.requestId || `${employeeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
    const outputDir = getUserOutputDir(employeeId);
    const outputPath = await translatePDF(requestId, inputPath, originalName, outputDir, employeeId);
    
    // 生成可访问的URL
    const outputUrl = `/translator/uploads/${employeeId}/translated/${path.basename(outputPath)}`;
    const inputUrl = `/translator/uploads/${employeeId}/temp/${path.basename(inputPath)}`;

    res.json({
      success: true,
      requestId: requestId,
      inputPath: inputUrl,
      outputPath: outputUrl,
      originalName: originalName,
      message: '翻译成功'
    });

  } catch (error) {
    logger.error('翻译错误:', error);
    
    // 只有在文件未被清理的情况下才清理
    // 如果是取消操作，文件已在 translatePDF 内部清理
    if (!error.fileCleaned) {
      try {
        await fs.unlink(inputPath);
        logger.info('已清理上传的临时文件');
      } catch (unlinkError) {
        // 只记录真正的错误（不是文件不存在）
        if (unlinkError.code !== 'ENOENT') {
          logger.error('清理文件失败:', unlinkError);
        }
      }
    }

    res.status(500).json({
      success: false,
      error: error.message || '翻译失败'
    });
  }
});

/**
 * POST /api/translate/cancel
 * 取消正在进行的翻译任务（需要认证）
 */
router.post('/api/translate/cancel', requireAuth, async (req, res) => {
  const { requestId } = req.body;
  const employeeId = req.employeeId;
  
  if (!requestId) {
    return res.status(400).json({
      success: false,
      error: '缺少 requestId'
    });
  }
  
  try {
    const processInfo = runningProcesses.get(requestId);
    
    if (!processInfo) {
      return res.status(404).json({
        success: false,
        error: '未找到运行中的翻译任务'
      });
    }
    
    // 验证是否是用户自己的任务
    if (processInfo.employeeId !== employeeId) {
      return res.status(403).json({
        success: false,
        error: '无权取消此任务'
      });
    }
    
    logger.info(`[${requestId}] 用户 ${employeeId} 请求取消翻译: ${processInfo.originalName}`);
    
    // 立即强制终止进程（pdf2zh_next 不响应 SIGTERM，直接用 SIGKILL）
    processInfo.process.kill('SIGKILL');
    logger.info(`[${requestId}] 已发送 SIGKILL 强制终止进程`);
    
    res.json({
      success: true,
      message: '取消请求已发送'
    });
    
  } catch (error) {
    logger.error(`取消翻译错误: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/translate/delete
 * 删除翻译文件（需要认证）
 */
router.post('/api/translate/delete', requireAuth, async (req, res) => {
  const { inputPath, outputPath } = req.body;
  const employeeId = req.employeeId;
  
  const results = {
    input: false,
    output: false,
    errors: []
  };

  try {
    const uploadDir = getUserUploadDir(employeeId);
    const outputDir = getUserOutputDir(employeeId);

    // 删除输入文件
    if (inputPath) {
      try {
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
 * 获取当前用户的翻译历史（需要认证）
 */
router.get('/api/translate/history', requireAuth, async (req, res) => {
  try {
    const employeeId = req.employeeId;
    const history = await loadUserHistory(employeeId);
    
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
 * 保存单条翻译历史（需要认证）
 */
router.post('/api/translate/history', requireAuth, async (req, res) => {
  try {
    const employeeId = req.employeeId;
    const task = req.body;
    
    if (!task || !task.id) {
      return res.status(400).json({
        success: false,
        error: '无效的任务数据'
      });
    }
    
    // 读取当前历史
    let history = await loadUserHistory(employeeId);
    
    // 去重：如果已存在相同ID的记录，先删除（防止重复保存）
    history = history.filter(t => t.id !== task.id);
    
    // 添加新记录（最新的在前面）
    history.unshift(task);
    
    // 限制历史记录数量
    if (history.length > MAX_HISTORY_PER_USER) {
      history = history.slice(0, MAX_HISTORY_PER_USER);
    }
    
    // 保存
    await saveUserHistory(employeeId, history);
    
    logger.info(`用户 ${employeeId} 保存历史记录: ${task.fileName}`);
    
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
 * 删除单条历史记录（需要认证）
 */
router.delete('/api/translate/history/:taskId', requireAuth, async (req, res) => {
  try {
    const employeeId = req.employeeId;
    const taskId = req.params.taskId;
    
    let history = await loadUserHistory(employeeId);
    const originalLength = history.length;
    
    // 过滤掉指定的任务
    history = history.filter(t => t.id !== taskId);
    
    if (history.length === originalLength) {
      return res.status(404).json({
        success: false,
        error: '记录不存在'
      });
    }
    
    // 保存
    await saveUserHistory(employeeId, history);
    
    logger.info(`用户 ${employeeId} 删除历史记录: ${taskId}`);
    
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
 * 清空当前用户的所有历史记录（需要认证）
 * 同时删除所有关联的文件
 */
router.delete('/api/translate/history', requireAuth, async (req, res) => {
  try {
    const employeeId = req.employeeId;
    
    // 读取当前历史记录
    const history = await loadUserHistory(employeeId);
    
    const uploadDir = getUserUploadDir(employeeId);
    const outputDir = getUserOutputDir(employeeId);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    // 删除所有关联的文件
    for (const task of history) {
      // 删除输入文件
      if (task.inputPath) {
        try {
          const fileName = path.basename(task.inputPath);
          const filePath = path.join(uploadDir, fileName);
          await fs.unlink(filePath);
          deletedCount++;
          logger.info(`已删除输入文件: ${fileName}`);
        } catch (error) {
          if (error.code !== 'ENOENT') { // 忽略文件不存在的错误
            errorCount++;
            logger.warn(`删除输入文件失败: ${task.inputPath} - ${error.message}`);
          }
        }
      }
      
      // 删除输出文件
      if (task.outputPath) {
        try {
          const fileName = path.basename(task.outputPath);
          const filePath = path.join(outputDir, fileName);
          await fs.unlink(filePath);
          deletedCount++;
          logger.info(`已删除输出文件: ${fileName}`);
        } catch (error) {
          if (error.code !== 'ENOENT') { // 忽略文件不存在的错误
            errorCount++;
            logger.warn(`删除输出文件失败: ${task.outputPath} - ${error.message}`);
          }
        }
      }
    }
    
    // 清空历史记录
    await saveUserHistory(employeeId, []);
    
    logger.info(`用户 ${employeeId} 清空所有历史记录，删除 ${deletedCount} 个文件，失败 ${errorCount} 个`);
    
    res.json({
      success: true,
      message: '历史记录已清空',
      deletedFiles: deletedCount,
      errors: errorCount
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
