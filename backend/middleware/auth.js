/**
 * 用户认证中间件
 * 
 * 功能：
 * - JWT令牌验证和解析
 * - 用户权限检查
 * - 保护需要登录的API接口
 * - 管理员权限验证
 * - 密码复杂度验证
 * 
 * 设计原则：以便捷性为主，安全性为辅
 */

const jwt = require('jsonwebtoken');
const { query } = require('../database/mysql');

/**
 * 验证JWT令牌的中间件
 * 用于保护需要登录的API接口
 */
function authenticateToken(req, res, next) {
  // 从请求头获取Authorization
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN格式

  // 检查令牌是否存在
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '访问被拒绝，请先登录',
      code: 'NO_TOKEN'
    });
  }

  // 验证令牌
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      // 处理不同类型的JWT错误
      let message = '无效的访问令牌';
      let code = 'INVALID_TOKEN';
      
      if (err.name === 'TokenExpiredError') {
        message = '访问令牌已过期，请重新登录';
        code = 'TOKEN_EXPIRED';
      } else if (err.name === 'JsonWebTokenError') {
        message = '访问令牌格式错误';
        code = 'MALFORMED_TOKEN';
      }
      
      return res.status(403).json({ 
        success: false, 
        message,
        code
      });
    }

    try {
      // 验证用户是否仍然存在且状态正常
      const users = await query(
        'SELECT id, email, username, role, status, avatar_url FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (users.length === 0) {
        return res.status(403).json({ 
          success: false, 
          message: '用户不存在',
          code: 'USER_NOT_FOUND'
        });
      }

      const user = users[0];

      // 检查用户状态
      if (user.status !== 'active') {
        return res.status(403).json({ 
          success: false, 
          message: '账户已被禁用，请联系管理员',
          code: 'ACCOUNT_DISABLED'
        });
      }

      // 将用户信息添加到请求对象中
      req.user = {
        userId: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatar_url: user.avatar_url
      };

      // 记录用户活动（可选）
      console.log(`🔐 用户认证成功: ${user.username} (${user.email})`);

      next();
    } catch (error) {
      console.error('认证中间件错误:', error);
      res.status(500).json({ 
        success: false, 
        message: '认证验证失败，请稍后重试',
        code: 'AUTH_ERROR'
      });
    }
  });
}

/**
 * 验证管理员权限的中间件
 * 必须在authenticateToken之后使用
 */
function requireAdmin(req, res, next) {
  // 检查用户是否已通过认证
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: '请先登录',
      code: 'NOT_AUTHENTICATED'
    });
  }

  // 检查用户是否为管理员
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: '需要管理员权限才能执行此操作',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  console.log(`👑 管理员权限验证通过: ${req.user.username}`);
  next();
}

/**
 * 可选认证中间件
 * 如果提供了令牌则验证，没有提供则继续执行
 * 用于可以匿名访问但登录后有额外功能的接口
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // 没有令牌，作为匿名用户继续
    req.user = null;
    return next();
  }

  // 有令牌，尝试验证
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      // 令牌无效，作为匿名用户继续
      req.user = null;
      return next();
    }

    try {
      // 获取用户信息
      const users = await query(
        'SELECT id, email, username, role, status, avatar_url FROM users WHERE id = ? AND status = "active"',
        [decoded.userId]
      );

      if (users.length > 0) {
        const user = users[0];
        req.user = {
          userId: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          avatar_url: user.avatar_url
        };
      } else {
        req.user = null;
      }
    } catch (error) {
      console.error('可选认证错误:', error);
      req.user = null;
    }

    next();
  });
}

/**
 * 验证密码复杂度
 * 要求：8位以上，包含字母和数字
 */
function validatePassword(password) {
  const errors = [];

  // 检查长度
  if (!password || password.length < 8) {
    errors.push('密码长度至少8位');
  }

  // 检查是否包含字母
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('密码必须包含字母');
  }

  // 检查是否包含数字
  if (!/\d/.test(password)) {
    errors.push('密码必须包含数字');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * 验证邮箱格式
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证用户名格式
 * 要求：2-20位，只能包含中文、字母、数字、下划线
 */
function validateUsername(username) {
  if (!username || username.length < 2 || username.length > 20) {
    return {
      isValid: false,
      error: '用户名长度必须在2-20位之间'
    };
  }

  // 允许中文、字母、数字、下划线
  const usernameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    return {
      isValid: false,
      error: '用户名只能包含中文、字母、数字和下划线'
    };
  }

  return { isValid: true };
}

/**
 * 生成JWT令牌
 * 过期时间：7天（便捷性优先）
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: '7d',
      issuer: 'bookreviewer-api',
      audience: 'bookreviewer-client'
    }
  );
}

/**
 * 解析JWT令牌（不验证有效性）
 * 用于调试和信息展示
 */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

/**
 * 检查用户是否有权限访问特定资源
 * 例如：用户只能编辑自己的书评
 */
function checkResourceOwnership(req, res, next) {
  return async (resourceType, resourceId, userIdField = 'user_id') => {
    try {
      const resource = await query(
        `SELECT ${userIdField} FROM ${resourceType} WHERE id = ?`,
        [resourceId]
      );

      if (resource.length === 0) {
        return res.status(404).json({
          success: false,
          message: '资源不存在',
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // 管理员可以访问所有资源
      if (req.user.role === 'admin') {
        return next();
      }

      // 检查是否为资源所有者
      if (resource[0][userIdField] !== req.user.userId) {
        return res.status(403).json({
          success: false,
          message: '您没有权限访问此资源',
          code: 'ACCESS_DENIED'
        });
      }

      next();
    } catch (error) {
      console.error('资源权限检查错误:', error);
      res.status(500).json({
        success: false,
        message: '权限检查失败',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
}

/**
 * 请求频率限制中间件
 * 简单的内存限制，防止暴力破解
 */
const requestCounts = new Map();

function rateLimit(maxRequests = 10, windowMinutes = 15) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMinutes * 60 * 1000;

    // 清理过期记录
    for (const [ip, records] of requestCounts.entries()) {
      const validRecords = records.filter(time => time > windowStart);
      if (validRecords.length === 0) {
        requestCounts.delete(ip);
      } else {
        requestCounts.set(ip, validRecords);
      }
    }

    // 检查当前IP的请求次数
    const clientRequests = requestCounts.get(clientIP) || [];
    const recentRequests = clientRequests.filter(time => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: `请求过于频繁，请${windowMinutes}分钟后再试`,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // 记录当前请求
    recentRequests.push(now);
    requestCounts.set(clientIP, recentRequests);

    next();
  };
}

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth,
  validatePassword,
  validateEmail,
  validateUsername,
  generateToken,
  decodeToken,
  checkResourceOwnership,
  rateLimit
};

// 模块加载日志
console.log('🔐 用户认证中间件已加载');
console.log('⚙️  配置: 令牌有效期7天，密码要求8位(字母+数字)');
