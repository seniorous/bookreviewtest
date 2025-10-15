/**
 * 工具函数集合
 * 用于处理常见的前端任务
 */

/**
 * 获取完整的头像 URL
 * @param {string} avatarUrl - 数据库中存储的头像 URL
 * @param {string} apiBaseUrl - API 基础地址，默认为 http://localhost:3001
 * @returns {string} 完整的头像 URL
 */
function getAvatarUrl(avatarUrl, apiBaseUrl = 'http://localhost:3001') {
  // 如果没有头像，返回默认头像
  if (!avatarUrl) {
    return 'backend/uploads/avatars/default.svg';
  }
  
  // 如果是完整的 HTTP(S) URL，直接返回
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }
  
  // 如果是相对路径（以 / 开头），拼接 API 基础地址
  if (avatarUrl.startsWith('/')) {
    return `${apiBaseUrl}${avatarUrl}`;
  }
  
  // 其他情况，假设是相对路径，拼接 API 基础地址
  return `${apiBaseUrl}/${avatarUrl}`;
}

/**
 * 格式化日期
 * @param {string|Date} date - 日期字符串或 Date 对象
 * @returns {string} 格式化后的日期字符串 (YYYY年MM月DD日)
 */
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}年${month}月${day}日`;
}

/**
 * 格式化相对时间
 * @param {string|Date} date - 日期字符串或 Date 对象
 * @returns {string} 相对时间描述 (如：刚刚、5分钟前、3天前)
 */
function formatRelativeTime(date) {
  if (!date) return '';
  
  const now = new Date();
  const target = new Date(date);
  const diff = now - target; // 毫秒差
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  if (months < 12) return `${months}个月前`;
  return `${years}年前`;
}

/**
 * 截断文本
 * @param {string} text - 要截断的文本
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀，默认为 '...'
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + suffix;
}

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要执行的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, limit = 300) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 深拷贝对象
 * @param {*} obj - 要拷贝的对象
 * @returns {*} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const clonedObj = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

// 如果在浏览器环境中，暴露到全局
if (typeof window !== 'undefined') {
  window.getAvatarUrl = getAvatarUrl;
  window.formatDate = formatDate;
  window.formatRelativeTime = formatRelativeTime;
  window.truncateText = truncateText;
  window.debounce = debounce;
  window.throttle = throttle;
  window.deepClone = deepClone;
}

