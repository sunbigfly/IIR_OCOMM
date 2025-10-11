/**
 * 认证API路由
 * 处理用户注册、登录、验证、重置密码等
 */

const express = require('express');
const router = express.Router();
const auth = require('../utils/auth');
const logger = require('../utils/logger');

/**
 * POST /api/auth/check
 * 检查工号是否存在
 */
router.post('/api/auth/check', async (req, res) => {
  try {
    const { employeeId } = req.body;

    if (!auth.validateEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        error: '工号格式无效（只允许字母、数字、下划线，长度1-32）'
      });
    }

    const exists = await auth.userExists(employeeId);

    res.json({
      success: true,
      exists
    });
  } catch (error) {
    logger.error('检查工号错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/auth/register
 * 注册新用户（首次使用）
 */
router.post('/api/auth/register', async (req, res) => {
  try {
    const { employeeId, password, name } = req.body;

    if (!auth.validateEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        error: '工号格式无效'
      });
    }

    if (!auth.validatePassword(password)) {
      return res.status(400).json({
        success: false,
        error: '密码必须是6位数字'
      });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '姓名不能为空'
      });
    }

    // 创建用户
    const userData = await auth.createUser(employeeId, password, name);

    // 生成token
    const token = auth.generateToken(employeeId);

    logger.info(`新用户注册: ${employeeId} (${name})`);

    res.json({
      success: true,
      token,
      employeeId,
      name: userData.name,
      message: '注册成功'
    });
  } catch (error) {
    logger.error('注册错误:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/api/auth/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!auth.validateEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        error: '工号格式无效'
      });
    }

    if (!auth.validatePassword(password)) {
      return res.status(400).json({
        success: false,
        error: '密码格式无效'
      });
    }

    // 验证密码
    const result = await auth.verifyUser(employeeId, password);

    if (!result.valid) {
      logger.warn(`登录失败: ${employeeId}`);
      return res.status(401).json({
        success: false,
        error: '工号或密码错误'
      });
    }

    // 生成token
    const token = auth.generateToken(employeeId);

    logger.info(`用户登录: ${employeeId} (${result.userData.name})`);

    res.json({
      success: true,
      token,
      employeeId,
      name: result.userData.name,
      message: '登录成功'
    });
  } catch (error) {
    logger.error('登录错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/auth/verify
 * 验证token是否有效
 */
router.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;

    const result = auth.verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: 'token无效'
      });
    }

    // 获取用户信息
    const userInfo = await auth.getUserInfo(result.employeeId);
    if (!userInfo) {
      return res.status(401).json({
        success: false,
        error: '用户不存在'
      });
    }

    res.json({
      success: true,
      employeeId: result.employeeId,
      name: userInfo.name,
      message: 'token有效'
    });
  } catch (error) {
    logger.error('验证token错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/auth/reset
 * 重置密码（需要管理员密码）
 */
router.post('/api/auth/reset', async (req, res) => {
  try {
    const { employeeId, newPassword, adminPassword } = req.body;

    if (!auth.validateEmployeeId(employeeId)) {
      return res.status(400).json({
        success: false,
        error: '工号格式无效'
      });
    }

    if (!auth.validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: '新密码必须是6位数字'
      });
    }

    // 重置密码（会验证管理员密码）
    await auth.resetPassword(employeeId, newPassword, adminPassword);

    logger.info(`密码重置: ${employeeId}`);

    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    logger.warn(`密码重置失败: ${error.message}`);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

