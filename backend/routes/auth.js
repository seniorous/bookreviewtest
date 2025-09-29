/**
 * 用户认证路由
 * 
 * API接口：
 * POST /api/auth/register - 用户注册
 * POST /api/auth/login - 用户登录
 * GET /api/auth/profile - 获取用户信息（需要登录）
 * PUT /api/auth/profile - 更新用户信息（需要登录）
 * PUT /api/auth/password - 修改密码（需要登录）
 * POST /api/auth/logout - 退出登录（可选）
 * GET /api/auth/verify - 验证令牌有效性
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../database/mysql');
const { 
  authenticateToken, 
  validatePassword, 
  validateEmail, 
  validateUsername, 
  generateToken,
  decodeToken,
  rateLimit
} = require('../middleware/auth');

const router = express.Router();

/**
 * 用户注册接口
 * POST /api/auth/register
 */
router.post('/register', rateLimit(5, 15), async (req, res) => {
  try {
    const { email, username, password, bio = '' } = req.body;

    console.log(`📝 用户注册请求: ${email} (${username})`);

    // 1. 输入验证
    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: '邮箱、用户名和密码都是必填项',
        code: 'MISSING_FIELDS'
      });
    }

    // 2. 邮箱格式验证
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的邮箱地址',
        code: 'INVALID_EMAIL'
      });
    }

    // 3. 用户名格式验证
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: usernameValidation.error,
        code: 'INVALID_USERNAME'
      });
    }

    // 4. 密码复杂度验证
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: '密码不符合要求：' + passwordValidation.errors.join('，'),
        code: 'INVALID_PASSWORD'
      });
    }

    // 5. 检查邮箱是否已存在
    const existingEmailUsers = await query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingEmailUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: '该邮箱已被注册，请使用其他邮箱或直接登录',
        code: 'EMAIL_EXISTS'
      });
    }

    // 6. 检查用户名是否已存在
    const existingUsernameUsers = await query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsernameUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: '该用户名已被使用，请选择其他用户名',
        code: 'USERNAME_EXISTS'
      });
    }

    // 7. 密码加密
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    // 8. 创建用户账户
    const result = await query(`
      INSERT INTO users (email, username, password_hash, bio, role, status) 
      VALUES (?, ?, ?, ?, 'user', 'active')
    `, [email, username, passwordHash, bio]);

    const userId = result.insertId;

    // 9. 生成JWT令牌
    const token = generateToken({
      id: userId,
      email,
      username,
      role: 'user'
    });

    // 10. 记录成功日志
    console.log(`✅ 用户注册成功: ${username} (ID: ${userId})`);

    // 11. 返回成功响应（不包含敏感信息）
    res.status(201).json({
      success: true,
      message: '注册成功，欢迎加入书评管理系统！',
      data: {
        token,
        user: {
          id: userId,
          email,
          username,
          bio,
          role: 'user',
          status: 'active',
          avatar_url: null,
          created_at: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ 用户注册失败:', error);
    res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试',
      code: 'REGISTRATION_ERROR'
    });
  }
});

/**
 * 用户登录接口
 * POST /api/auth/login
 */
router.post('/login', rateLimit(5, 15), async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(`🔐 用户登录请求: ${email}`);

    // 1. 输入验证
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '请输入邮箱和密码',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // 2. 查找用户
    const users = await query(`
      SELECT id, email, username, password_hash, role, status, avatar_url, bio, created_at 
      FROM users 
      WHERE email = ?
    `, [email]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '邮箱或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = users[0];

    // 3. 检查用户状态
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: '账户已被禁用，请联系管理员',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // 4. 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '邮箱或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 5. 生成JWT令牌
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    });

    // 6. 更新最后登录时间（可选）
    await query(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    // 7. 记录成功日志
    console.log(`✅ 用户登录成功: ${user.username} (${user.role})`);

    // 8. 返回成功响应
    res.json({
      success: true,
      message: '登录成功，欢迎回来！',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          avatar_url: user.avatar_url,
          bio: user.bio,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('❌ 用户登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    console.log(`📋 获取用户信息: ${req.user.username}`);

    // 获取用户详细信息和统计数据
    const users = await query(`
      SELECT 
        u.id, u.email, u.username, u.role, u.status, u.avatar_url, u.bio, 
        u.total_reviews, u.total_likes_received, u.created_at, u.updated_at,
        COUNT(DISTINCT f.id) as favorites_count,
        COUNT(DISTINCT l.id) as likes_given_count
      FROM users u
      LEFT JOIN user_favorites f ON u.id = f.user_id
      LEFT JOIN review_likes l ON u.id = l.user_id
      WHERE u.id = ?
      GROUP BY u.id
    `, [req.user.userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      message: '用户信息获取成功',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          avatar_url: user.avatar_url,
          bio: user.bio,
          total_reviews: user.total_reviews,
          total_likes_received: user.total_likes_received,
          favorites_count: user.favorites_count,
          likes_given_count: user.likes_given_count,
          created_at: user.created_at,
          updated_at: user.updated_at
        }
      }
    });

  } catch (error) {
    console.error('❌ 获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败',
      code: 'PROFILE_ERROR'
    });
  }
});

/**
 * 更新用户信息
 * PUT /api/auth/profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { username, bio, avatar_url } = req.body;

    console.log(`📝 更新用户信息: ${req.user.username}`);

    // 构建更新字段
    const updates = [];
    const values = [];

    if (username !== undefined) {
      // 验证用户名
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: usernameValidation.error,
          code: 'INVALID_USERNAME'
        });
      }

      // 检查用户名是否已被其他用户使用
      const existingUsers = await query(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, req.user.userId]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: '该用户名已被使用，请选择其他用户名',
          code: 'USERNAME_EXISTS'
        });
      }

      updates.push('username = ?');
      values.push(username);
    }

    if (bio !== undefined) {
      if (bio.length > 500) {
        return res.status(400).json({
          success: false,
          message: '个人简介不能超过500字符',
          code: 'BIO_TOO_LONG'
        });
      }
      updates.push('bio = ?');
      values.push(bio);
    }

    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有提供要更新的信息',
        code: 'NO_UPDATES'
      });
    }

    // 执行更新
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.user.userId);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    console.log(`✅ 用户信息更新成功: ${req.user.username}`);

    res.json({
      success: true,
      message: '用户信息更新成功'
    });

  } catch (error) {
    console.error('❌ 更新用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户信息失败',
      code: 'UPDATE_ERROR'
    });
  }
});

/**
 * 修改密码
 * PUT /api/auth/password
 */
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    console.log(`🔐 修改密码请求: ${req.user.username}`);

    // 1. 输入验证
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请输入当前密码和新密码',
        code: 'MISSING_PASSWORDS'
      });
    }

    // 2. 新密码复杂度验证
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: '新密码不符合要求：' + passwordValidation.errors.join('，'),
        code: 'INVALID_NEW_PASSWORD'
      });
    }

    // 3. 获取用户当前密码哈希
    const users = await query(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 4. 验证当前密码
    const isValidCurrentPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isValidCurrentPassword) {
      return res.status(401).json({
        success: false,
        message: '当前密码错误',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // 5. 检查新密码是否与当前密码相同
    const isSamePassword = await bcrypt.compare(newPassword, users[0].password_hash);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: '新密码不能与当前密码相同',
        code: 'SAME_PASSWORD'
      });
    }

    // 6. 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    // 7. 更新密码
    await query(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, req.user.userId]
    );

    console.log(`✅ 密码修改成功: ${req.user.username}`);

    res.json({
      success: true,
      message: '密码修改成功'
    });

  } catch (error) {
    console.error('❌ 修改密码失败:', error);
    res.status(500).json({
      success: false,
      message: '修改密码失败',
      code: 'PASSWORD_UPDATE_ERROR'
    });
  }
});

/**
 * 验证令牌有效性
 * GET /api/auth/verify
 */
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: '令牌有效',
    data: {
      user: req.user
    }
  });
});

/**
 * 退出登录（可选接口）
 * POST /api/auth/logout
 * 注意：由于JWT是无状态的，客户端删除令牌即可实现退出
 */
router.post('/logout', (req, res) => {
  // 这里可以记录退出日志或清理服务端会话（如果有的话）
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const decoded = decodeToken(token);
    if (decoded) {
      console.log(`👋 用户退出登录: ${decoded.username}`);
    }
  }

  res.json({
    success: true,
    message: '退出登录成功'
  });
});

module.exports = router;

// 路由加载日志
console.log('🔐 用户认证路由已加载');
console.log('📋 API接口: /api/auth/register, /login, /profile, /password, /verify, /logout');
