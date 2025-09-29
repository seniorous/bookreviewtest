/**
 * MySQL数据库连接管理模块
 * 使用连接池技术提供高性能的数据库访问
 * 
 * 功能特性：
 * - 连接池管理（提高并发性能）
 * - 自动重连机制
 * - 详细错误日志
 * - 事务支持
 * - 连接健康检查
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// 连接池配置
const poolConfig = {
  // 基础连接信息
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'bookreviewer',
  port: parseInt(process.env.DB_PORT) || 3306,
  
  // 连接池配置
  waitForConnections: true,          // 等待可用连接
  connectionLimit: 10,               // 最大连接数
  queueLimit: 0,                     // 队列限制（0=无限制）
  
  // 连接配置
  charset: 'utf8mb4',                // 字符集（支持emoji）
  timezone: '+08:00',                // 时区设置
  acquireTimeout: 60000,             // 获取连接超时时间(60秒)
  enableKeepAlive: true,             // 启用keep-alive
  keepAliveInitialDelay: 0,          // keep-alive初始延迟
  
  // 高级配置
  multipleStatements: false,         // 禁用多条SQL语句（安全考虑）
  supportBigNumbers: true,           // 支持大数字
  bigNumberStrings: true,            // 大数字返回字符串
  
  // SSL配置（生产环境建议启用）
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};

// 创建连接池
const pool = mysql.createPool(poolConfig);

// 连接池事件监听
pool.on('connection', (connection) => {
  console.log(`📡 新建数据库连接，连接ID: ${connection.threadId}`);
});

pool.on('acquire', (connection) => {
  console.log(`🔗 获取数据库连接，连接ID: ${connection.threadId}`);
});

pool.on('release', (connection) => {
  console.log(`🔓 释放数据库连接，连接ID: ${connection.threadId}`);
});

pool.on('error', (error) => {
  console.error('❌ 连接池发生错误:', error);
  if (error.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 数据库连接丢失，自动重连中...');
  }
});

/**
 * 执行SQL查询的统一接口
 * @param {string} sql - SQL语句
 * @param {Array} params - 参数数组
 * @returns {Promise<Array>} 查询结果
 */
async function query(sql, params = []) {
  const startTime = Date.now();
  let connection;
  
  try {
    // 记录查询开始
    console.log(`🔍 执行SQL查询: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
    if (params.length > 0) {
      console.log(`📋 查询参数:`, params);
    }
    
    // 执行查询
    const [results] = await pool.execute(sql, params);
    
    // 记录执行时间
    const duration = Date.now() - startTime;
    console.log(`✅ 查询完成，耗时: ${duration}ms，结果数量: ${Array.isArray(results) ? results.length : '1'}`);
    
    return results;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // 详细的错误日志
    console.error('❌ 数据库查询失败:');
    console.error(`   SQL: ${sql}`);
    console.error(`   参数: ${JSON.stringify(params)}`);
    console.error(`   耗时: ${duration}ms`);
    console.error(`   错误代码: ${error.code}`);
    console.error(`   错误信息: ${error.message}`);
    
    // 根据错误类型提供不同的处理
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        throw new Error('数据已存在，请检查唯一性约束');
      case 'ER_NO_SUCH_TABLE':
        throw new Error('数据表不存在，请检查数据库结构');
      case 'ER_BAD_FIELD_ERROR':
        throw new Error('字段不存在，请检查SQL语句');
      case 'ECONNREFUSED':
        throw new Error('无法连接到数据库服务器');
      case 'ER_ACCESS_DENIED_ERROR':
        throw new Error('数据库访问被拒绝，请检查用户名和密码');
      default:
        throw error;
    }
  }
}

/**
 * 执行事务操作
 * @param {Function} callback - 事务回调函数
 * @returns {Promise<any>} 事务结果
 */
async function transaction(callback) {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔄 开始数据库事务');
    await connection.beginTransaction();
    
    // 创建事务查询函数
    const transactionQuery = async (sql, params = []) => {
      console.log(`🔍 [事务] 执行SQL: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
      const [results] = await connection.execute(sql, params);
      return results;
    };
    
    // 执行事务回调
    const result = await callback(transactionQuery);
    
    // 提交事务
    await connection.commit();
    console.log('✅ 事务提交成功');
    
    return result;
    
  } catch (error) {
    // 回滚事务
    await connection.rollback();
    console.error('❌ 事务回滚:', error.message);
    throw error;
    
  } finally {
    // 释放连接
    connection.release();
  }
}

/**
 * 测试数据库连接
 * @returns {Promise<boolean>} 连接是否成功
 */
async function testConnection() {
  try {
    console.log('🔍 测试数据库连接...');
    
    const connection = await pool.getConnection();
    
    // 执行简单查询测试
    const [result] = await connection.execute('SELECT 1 as test, NOW() as db_time');
    
    console.log('✅ 数据库连接成功');
    console.log(`📊 连接测试结果:`, result[0]);
    console.log(`🕐 数据库时间: ${result[0].db_time}`);
    
    connection.release();
    return true;
    
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    
    // 提供详细的故障排除信息
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 故障排除提示:');
      console.error('   1. 检查MySQL服务是否启动');
      console.error('   2. 检查端口号是否正确');
      console.error('   3. 检查防火墙设置');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 故障排除提示:');
      console.error('   1. 检查用户名和密码是否正确');
      console.error('   2. 检查用户是否有访问权限');
      console.error('   3. 检查.env文件配置');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('💡 故障排除提示:');
      console.error('   1. 检查数据库名称是否正确');
      console.error('   2. 运行数据库初始化脚本');
    }
    
    return false;
  }
}

/**
 * 获取连接池状态信息
 * @returns {Object} 连接池状态
 */
function getPoolStatus() {
  const status = {
    totalConnections: pool.pool._allConnections.length,
    freeConnections: pool.pool._freeConnections.length,
    usedConnections: pool.pool._allConnections.length - pool.pool._freeConnections.length,
    queuedRequests: pool.pool._connectionQueue.length
  };
  
  console.log('📊 连接池状态:', status);
  return status;
}

/**
 * 优雅关闭连接池
 */
async function closePool() {
  try {
    console.log('🔄 正在关闭数据库连接池...');
    await pool.end();
    console.log('✅ 数据库连接池已关闭');
  } catch (error) {
    console.error('❌ 关闭连接池失败:', error.message);
    throw error;
  }
}

// 进程退出时自动关闭连接池
process.on('SIGINT', async () => {
  console.log('📡 收到退出信号，正在关闭数据库连接...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('📡 收到终止信号，正在关闭数据库连接...');
  await closePool();
  process.exit(0);
});

/**
 * 获取数据库连接
 * @returns {Promise<Connection>} 数据库连接
 */
async function getConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`📡 新建数据库连接，连接ID: ${connection.connection.connectionId}`);
    return connection;
  } catch (error) {
    console.error('❌ 获取数据库连接失败:', error);
    throw error;
  }
}

/**
 * 释放数据库连接
 * @param {Connection} connection 要释放的连接
 */
function releaseConnection(connection) {
  if (connection) {
    console.log(`🔓 释放数据库连接，连接ID: ${connection.connection.connectionId}`);
    connection.release();
  }
}

// 导出模块
module.exports = {
  query,           // 基础查询函数
  transaction,     // 事务处理函数  
  testConnection,  // 连接测试函数
  getPoolStatus,   // 状态查询函数
  closePool,       // 关闭连接池函数
  getConnection,   // 获取连接函数
  releaseConnection, // 释放连接函数
  pool             // 原始连接池对象（高级用法）
};

// 模块加载时的初始化日志
console.log('📚 MySQL连接模块已加载');
console.log(`🔗 连接配置: ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);
console.log(`⚙️  连接池大小: ${poolConfig.connectionLimit}`);
console.log(`🌍 字符集: ${poolConfig.charset}`);
console.log(`🕐 时区: ${poolConfig.timezone}`);
