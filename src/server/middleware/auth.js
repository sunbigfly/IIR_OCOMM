/**
 * 认证中间件
 * 用于保护需要认证的API路由
 */

const auth = require('../utils/auth');
const logger = require('../utils/logger');

/**
 * 验证token中间件
 * 从请求头或请求体中提取token并验证
 * 验证通过后将employeeId添加到req对象
 */
async function requireAuth(req, res, next) {
  try {
    // 从请求头或请求体中获取token
    let token = req.headers.authorization;
    
    if (token && token.startsWith('Bearer ')) {
      token = token.substring(7);
    } else if (req.body && req.body.token) {
      token = req.body.token;
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: '未提供认证token'
      });
    }

    // 验证token
    const result = auth.verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: 'token无效'
      });
    }

    // 检查用户是否存在
    const exists = await auth.userExists(result.employeeId);
    if (!exists) {
      return res.status(401).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 将employeeId添加到请求对象
    req.employeeId = result.employeeId;
    req.authenticated = true;

    next();
  } catch (error) {
    logger.error('认证中间件错误:', error);
    res.status(500).json({
      success: false,
      error: '认证失败'
    });
  }
}

module.exports = {
  requireAuth
};

