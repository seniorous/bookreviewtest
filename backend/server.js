/**
 * 书评管理系统后端服务器
 * 
 * 主要功能：
 * - 用户认证系统
 * - 书评管理API
 * - 文件上传处理
 * - 统一错误处理
 * - API文档和健康检查
 * 
 * 启动命令：
 * - 开发环境：npm run dev
 * - 生产环境：npm start
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// 导入数据库和路由
const { testConnection } = require('./database/mysql');
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const reviewRoutes = require('./routes/reviews');
const likesRoutes = require('./routes/likes');
const favoritesRoutes = require('./routes/favorites');
const commentsRoutes = require('./routes/comments');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 启动时间记录
const startTime = new Date();

/**
 * ===== 基础中间件配置 =====
 */

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { 
    policy: "cross-origin" 
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  }
}));

// CORS配置
const corsOptions = {
  origin: function (origin, callback) {
    // 允许的源列表
    const allowedOrigins = [
      'http://localhost:8080',
      'http://127.0.0.1:8080', 
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];
    
    // 开发环境允许任何源
    if (NODE_ENV === 'development') {
      allowedOrigins.push(origin);
    }
    
    // 检查源是否被允许
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS策略不允许此源'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// 请求解析中间件
app.use(express.json({ 
  limit: '10mb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// 请求日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`📡 [${timestamp}] ${method} ${url} - ${ip}`);
  
  // 记录响应时间
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const statusColor = status >= 400 ? '🔴' : status >= 300 ? '🟡' : '🟢';
    
    console.log(`${statusColor} [${timestamp}] ${method} ${url} - ${status} (${duration}ms)`);
  });
  
  next();
});

/**
 * ===== 全局限流配置 =====
 */

// API全局限流
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 每个IP最多1000个请求
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`⚠️  IP限流触发: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: '请求过于频繁，请15分钟后再试',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

app.use('/api/', generalLimiter);

/**
 * ===== 静态文件服务 =====
 */

// 上传文件静态服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d', // 缓存1天
  etag: true
}));

// API文档静态服务（如果需要）
app.use('/docs', express.static(path.join(__dirname, 'docs'), {
  maxAge: '1h'
}));

/**
 * ===== 健康检查和信息接口 =====
 */

// 根路径
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 书评管理系统API服务器运行正常',
    version: '1.0.0',
    environment: NODE_ENV,
    uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      docs: '/docs'
    }
  });
});

// 健康检查接口
app.get('/api/health', async (req, res) => {
  try {
    // 检查数据库连接
    const dbStatus = await testConnection();
    
    const healthInfo = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
      version: '1.0.0',
      environment: NODE_ENV,
      database: {
        status: dbStatus ? 'connected' : 'disconnected',
        healthy: dbStatus
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      }
    };

    // 如果数据库连接失败，返回警告状态
    if (!dbStatus) {
      healthInfo.status = 'warning';
      healthInfo.success = false;
      return res.status(503).json(healthInfo);
    }

    res.json(healthInfo);
    
  } catch (error) {
    console.error('❌ 健康检查失败:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: '服务不可用',
      error: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API信息接口
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    message: '书评管理系统API',
    version: '1.0.0',
    description: '为书评管理系统提供完整的后端API服务',
    features: [
      '用户认证与授权',
      '书评CRUD操作', 
      '书籍管理',
      '点赞和收藏',
      '评论系统',
      '标签管理',
      '文件上传',
      '数据统计'
    ],
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile',
        updateProfile: 'PUT /api/auth/profile',
        changePassword: 'PUT /api/auth/password',
        verify: 'GET /api/auth/verify',
        logout: 'POST /api/auth/logout'
      },
      books: {
        create: 'POST /api/books',
        list: 'GET /api/books',
        detail: 'GET /api/books/:id',
        update: 'PUT /api/books/:id',
        delete: 'DELETE /api/books/:id',
        search: 'GET /api/books/search/intelligent'
      },
      reviews: {
        create: 'POST /api/reviews',
        list: 'GET /api/reviews',
        detail: 'GET /api/reviews/:id',
        update: 'PUT /api/reviews/:id',
        delete: 'DELETE /api/reviews/:id',
        bookReviews: 'GET /api/reviews/books/:bookId'
      },
      likes: {
        like: 'POST /api/likes/reviews/:reviewId',
        unlike: 'DELETE /api/likes/reviews/:reviewId',
        status: 'GET /api/likes/reviews/:reviewId',
        userHistory: 'GET /api/likes/user/:userId',
        myHistory: 'GET /api/likes/my',
        batch: 'POST /api/likes/reviews/batch'
      },
      favorites: {
        favorite: 'POST /api/favorites/reviews/:reviewId',
        unfavorite: 'DELETE /api/favorites/reviews/:reviewId',
        status: 'GET /api/favorites/reviews/:reviewId',
        userHistory: 'GET /api/favorites/user/:userId',
        myHistory: 'GET /api/favorites/my',
        batch: 'POST /api/favorites/reviews/batch',
        stats: 'GET /api/favorites/stats'
      },
      comments: {
        create: 'POST /api/comments/reviews/:reviewId',
        list: 'GET /api/comments/reviews/:reviewId',
        detail: 'GET /api/comments/:id',
        update: 'PUT /api/comments/:id',
        delete: 'DELETE /api/comments/:id',
        userHistory: 'GET /api/comments/user/:userId',
        myHistory: 'GET /api/comments/my',
        reply: 'POST /api/comments/:id/reply',
        moderate: 'PUT /api/comments/:id/status',
        stats: 'GET /api/comments/stats'
      }
    },
    documentation: '/docs',
    repository: 'https://github.com/your-repo/bookreviewer',
    contact: 'admin@bookreviewer.com'
  });
});

/**
 * ===== API路由配置 =====
 */

// 用户认证路由
app.use('/api/auth', authRoutes);

// 书籍管理路由
app.use('/api/books', bookRoutes);

// 书评管理路由
app.use('/api/reviews', reviewRoutes);

// 点赞系统路由
app.use('/api/likes', likesRoutes);

// 收藏系统路由
app.use('/api/favorites', favoritesRoutes);

// 评论系统路由
app.use('/api/comments', commentsRoutes);

// TODO: 其他路由将在后续步骤中添加
// app.use('/api/admin', adminRoutes);
// app.use('/api/upload', uploadRoutes);

/**
 * ===== 错误处理中间件 =====
 */

// 404处理
app.use((req, res) => {
  console.log(`⚠️  404 - 未找到资源: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: '请求的资源不存在',
    code: 'NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err);

  // 记录错误详情
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  };

  // CORS错误特殊处理
  if (err.message.includes('CORS策略')) {
    return res.status(403).json({
      success: false,
      message: 'CORS策略不允许此请求源',
      code: 'CORS_ERROR'
    });
  }

  // 根据环境返回不同详细程度的错误信息
  const errorResponse = {
    success: false,
    message: '服务器内部错误',
    code: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString()
  };

  // 开发环境返回详细错误信息
  if (NODE_ENV === 'development') {
    errorResponse.error = {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl
    };
  }

  res.status(500).json(errorResponse);
});

/**
 * ===== 优雅关闭处理 =====
 */

process.on('SIGINT', () => {
  console.log('\n📡 收到SIGINT信号，正在优雅关闭服务器...');
  gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n📡 收到SIGTERM信号，正在优雅关闭服务器...');
  gracefulShutdown('SIGTERM');
});

function gracefulShutdown(signal) {
  console.log(`🔄 开始优雅关闭流程 (${signal})...`);
  
  // 这里可以添加清理逻辑
  // - 关闭数据库连接
  // - 完成当前请求
  // - 清理临时文件等
  
  console.log('✅ 服务器已优雅关闭');
  process.exit(0);
}

/**
 * ===== 服务器启动 =====
 */

async function startServer() {
  try {
    console.log('🚀 正在启动书评管理系统API服务器...');
    console.log(`📊 环境: ${NODE_ENV}`);
    console.log(`🌐 端口: ${PORT}`);
    
    // 测试数据库连接
    console.log('🔍 测试数据库连接...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ 数据库连接失败，服务器启动终止');
      console.error('💡 请检查：');
      console.error('   1. MySQL服务是否运行');
      console.error('   2. .env文件配置是否正确');
      console.error('   3. 数据库是否已初始化');
      process.exit(1);
    }

    // 启动HTTP服务器
    const server = app.listen(PORT, () => {
      console.log('✅ 服务器启动成功！');
      console.log('');
      console.log('📋 服务信息:');
      console.log(`   🌐 服务器地址: http://localhost:${PORT}`);
      console.log(`   🔍 健康检查: http://localhost:${PORT}/api/health`);
      console.log(`   📖 API信息: http://localhost:${PORT}/api/info`);
      console.log(`   🔐 认证接口: http://localhost:${PORT}/api/auth/*`);
      console.log('');
      console.log('📚 API接口列表:');
      console.log('   🔐 认证接口:');
      console.log('     POST /api/auth/register - 用户注册');
      console.log('     POST /api/auth/login - 用户登录'); 
      console.log('     GET  /api/auth/profile - 获取用户信息');
      console.log('     PUT  /api/auth/profile - 更新用户信息');
      console.log('     PUT  /api/auth/password - 修改密码');
      console.log('     GET  /api/auth/verify - 验证令牌');
      console.log('     POST /api/auth/logout - 退出登录');
      console.log('   📚 书籍管理:');
      console.log('     POST /api/books - 创建书籍');
      console.log('     GET  /api/books - 获取书籍列表');
      console.log('     GET  /api/books/:id - 获取书籍详情');
      console.log('     PUT  /api/books/:id - 更新书籍');
      console.log('     DELETE /api/books/:id - 删除书籍');
      console.log('     GET  /api/books/search/intelligent - 智能搜索');
      console.log('   📝 书评管理:');
      console.log('     POST /api/reviews - 创建书评');
      console.log('     GET  /api/reviews - 获取书评列表');
      console.log('     GET  /api/reviews/:id - 获取书评详情');
      console.log('     PUT  /api/reviews/:id - 更新书评');
      console.log('     DELETE /api/reviews/:id - 删除书评');
      console.log('     GET  /api/reviews/books/:bookId - 获取书籍书评');
      console.log('   👍 点赞系统:');
      console.log('     POST /api/likes/reviews/:reviewId - 点赞书评');
      console.log('     DELETE /api/likes/reviews/:reviewId - 取消点赞');
      console.log('     GET  /api/likes/reviews/:reviewId - 查看点赞状态');
      console.log('     GET  /api/likes/user/:userId - 用户点赞历史');
      console.log('     GET  /api/likes/my - 我的点赞历史');
      console.log('     POST /api/likes/reviews/batch - 批量查询点赞状态');
      console.log('   ⭐ 收藏系统:');
      console.log('     POST /api/favorites/reviews/:reviewId - 收藏书评');
      console.log('     DELETE /api/favorites/reviews/:reviewId - 取消收藏');
      console.log('     GET  /api/favorites/reviews/:reviewId - 查看收藏状态');
      console.log('     GET  /api/favorites/user/:userId - 用户收藏历史');
      console.log('     GET  /api/favorites/my - 我的收藏历史');
      console.log('     POST /api/favorites/reviews/batch - 批量查询收藏状态');
      console.log('     GET  /api/favorites/stats - 收藏统计信息');
      console.log('   💬 评论系统:');
      console.log('     POST /api/comments/reviews/:reviewId - 发表评论');
      console.log('     GET  /api/comments/reviews/:reviewId - 获取评论列表');
      console.log('     GET  /api/comments/:id - 获取评论详情');
      console.log('     PUT  /api/comments/:id - 更新评论');
      console.log('     DELETE /api/comments/:id - 删除评论');
      console.log('     GET  /api/comments/user/:userId - 用户评论历史');
      console.log('     GET  /api/comments/my - 我的评论历史');
      console.log('     POST /api/comments/:id/reply - 回复评论');
      console.log('     PUT  /api/comments/:id/status - 审核评论（管理员）');
      console.log('     GET  /api/comments/stats - 评论统计信息');
      console.log('');
      console.log('💡 使用Ctrl+C优雅关闭服务器');
      console.log('════════════════════════════════════════════════════');
    });

    // 处理服务器错误
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ 端口${PORT}已被占用，请尝试其他端口`);
        console.error('💡 解决方案：');
        console.error('   1. 修改.env文件中的PORT值');
        console.error('   2. 或结束占用端口的进程');
      } else {
        console.error('❌ 服务器启动失败:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ 服务器初始化失败:', error);
    process.exit(1);
  }
}

// 启动服务器
if (require.main === module) {
  startServer();
}

module.exports = app;

// 文件加载完成日志
console.log('📚 服务器模块已加载');
console.log(`🔧 配置: ${NODE_ENV}环境, 端口${PORT}`);
