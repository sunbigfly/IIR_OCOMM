/**
 * 简单的日志工具
 * 提供统一的日志输出格式
 */

const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  
  warn: (message, ...args) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  
  success: (message, ...args) => {
    console.log(`✅ ${message}`, ...args);
  }
};

module.exports = logger;

