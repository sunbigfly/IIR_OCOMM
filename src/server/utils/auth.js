/**
 * 认证工具模块
 * 提供密码hash、token生成/验证等功能
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// 配置
const TOKEN_SECRET = 'iir-ocomm-pdf-translator-secret-2025'; // 用于签名token
const ADMIN_PASSWORD = 'sssw'; // 管理员密码
const USERS_DIR = path.join(__dirname, '../../public/translator/data/users');

// 确保用户目录存在
async function ensureUsersDir() {
  try {
    await fs.mkdir(USERS_DIR, { recursive: true });
  } catch (error) {
    // 目录已存在，忽略
  }
}

ensureUsersDir();

/**
 * 验证工号格式
 * 只允许字母、数字、下划线，长度1-32
 */
function validateEmployeeId(employeeId) {
  if (!employeeId || typeof employeeId !== 'string') {
    return false;
  }
  return /^[A-Za-z0-9_]{1,32}$/.test(employeeId);
}

/**
 * 验证密码格式（6位数字）
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return false;
  }
  return /^\d{6}$/.test(password);
}

/**
 * 计算密码hash (SHA-256)
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 生成token
 * 格式: employeeId:signature
 * signature = HMAC-SHA256(employeeId, secret)
 */
function generateToken(employeeId) {
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(employeeId)
    .digest('hex');
  return `${employeeId}:${signature}`;
}

/**
 * 验证token
 * 返回: { valid: boolean, employeeId: string | null }
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, employeeId: null };
  }

  const parts = token.split(':');
  if (parts.length !== 2) {
    return { valid: false, employeeId: null };
  }

  const [employeeId, signature] = parts;

  // 验证工号格式
  if (!validateEmployeeId(employeeId)) {
    return { valid: false, employeeId: null };
  }

  // 重新计算签名
  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(employeeId)
    .digest('hex');

  // 时序安全的字符串比较
  const valid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  return { valid, employeeId: valid ? employeeId : null };
}

/**
 * 验证管理员密码
 */
function verifyAdminPassword(password) {
  return password === ADMIN_PASSWORD;
}

/**
 * 获取用户文件路径
 */
function getUserFilePath(employeeId) {
  return path.join(USERS_DIR, `${employeeId}.json`);
}

/**
 * 检查用户是否存在
 */
async function userExists(employeeId) {
  if (!validateEmployeeId(employeeId)) {
    return false;
  }

  const filePath = getUserFilePath(employeeId);
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 创建新用户
 */
async function createUser(employeeId, password, name) {
  if (!validateEmployeeId(employeeId)) {
    throw new Error('工号格式无效');
  }

  if (!validatePassword(password)) {
    throw new Error('密码必须是6位数字');
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('姓名不能为空');
  }

  if (name.trim().length > 50) {
    throw new Error('姓名长度不能超过50个字符');
  }

  // 检查是否已存在
  if (await userExists(employeeId)) {
    throw new Error('工号已存在');
  }

  const userData = {
    employeeId,
    name: name.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  const filePath = getUserFilePath(employeeId);
  await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf-8');

  return userData;
}

/**
 * 验证用户密码
 * 返回 { valid: boolean, userData: object | null }
 */
async function verifyUser(employeeId, password) {
  if (!validateEmployeeId(employeeId)) {
    return { valid: false, userData: null };
  }

  if (!validatePassword(password)) {
    return { valid: false, userData: null };
  }

  const filePath = getUserFilePath(employeeId);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const userData = JSON.parse(data);
    
    const passwordHash = hashPassword(password);
    
    // 时序安全的比较
    const valid = crypto.timingSafeEqual(
      Buffer.from(userData.passwordHash),
      Buffer.from(passwordHash)
    );

    // 更新最后登录时间
    if (valid) {
      userData.lastLogin = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf-8');
      
      // 返回用户信息（不包含密码hash）
      return {
        valid: true,
        userData: {
          employeeId: userData.employeeId,
          name: userData.name,
          lastLogin: userData.lastLogin
        }
      };
    }

    return { valid: false, userData: null };
  } catch (error) {
    return { valid: false, userData: null };
  }
}

/**
 * 获取用户信息（不包含密码）
 */
async function getUserInfo(employeeId) {
  if (!validateEmployeeId(employeeId)) {
    return null;
  }

  const filePath = getUserFilePath(employeeId);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const userData = JSON.parse(data);
    
    return {
      employeeId: userData.employeeId,
      name: userData.name,
      lastLogin: userData.lastLogin,
      createdAt: userData.createdAt
    };
  } catch (error) {
    return null;
  }
}

/**
 * 重置用户密码（需要管理员密码）
 */
async function resetPassword(employeeId, newPassword, adminPassword) {
  if (!validateEmployeeId(employeeId)) {
    throw new Error('工号格式无效');
  }

  if (!validatePassword(newPassword)) {
    throw new Error('密码必须是6位数字');
  }

  if (!verifyAdminPassword(adminPassword)) {
    throw new Error('管理员密码错误');
  }

  if (!(await userExists(employeeId))) {
    throw new Error('工号不存在');
  }

  const filePath = getUserFilePath(employeeId);
  const data = await fs.readFile(filePath, 'utf-8');
  const userData = JSON.parse(data);

  // 更新密码
  userData.passwordHash = hashPassword(newPassword);
  userData.passwordResetAt = new Date().toISOString();

  await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf-8');

  return true;
}

module.exports = {
  validateEmployeeId,
  validatePassword,
  hashPassword,
  generateToken,
  verifyToken,
  verifyAdminPassword,
  userExists,
  createUser,
  verifyUser,
  getUserInfo,
  resetPassword
};

