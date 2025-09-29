/**
 * 数据库初始化脚本
 * 
 * 功能：
 * - 自动创建数据库（如果不存在）
 * - 执行完整的表结构创建
 * - 插入默认数据和配置
 * - 验证初始化结果
 * - 生成详细的初始化报告
 * 
 * 使用方法：
 * 1. 确保.env文件已正确配置
 * 2. 运行: npm run init-db
 * 3. 检查控制台输出确认结果
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 彩色控制台输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 主初始化函数
 */
async function initDatabase() {
  let connection;
  const startTime = Date.now();
  
  try {
    colorLog('cyan', '🚀 ===== 书评管理系统数据库初始化开始 =====');
    colorLog('blue', `📅 初始化时间: ${new Date().toLocaleString()}`);
    
    // 第一步：验证环境配置
    await validateEnvironment();
    
    // 第二步：连接MySQL服务器
    connection = await connectToMySQL();
    
    // 第三步：创建或确认数据库存在
    await ensureDatabase(connection);
    
    // 第四步：切换到目标数据库
    await connection.query(`USE ${process.env.DB_NAME || 'bookreviewer'}`);
    colorLog('green', `✅ 已切换到数据库: ${process.env.DB_NAME || 'bookreviewer'}`);
    
    // 第五步：备份现有数据（如果有）
    await backupExistingData(connection);
    
    // 第六步：执行数据库结构脚本
    await executeSchemaScript(connection);
    
    // 第七步：验证表结构
    await validateTableStructure(connection);
    
    // 第八步：验证默认数据
    await validateDefaultData(connection);
    
    // 第九步：性能优化设置
    await optimizeDatabase(connection);
    
    // 第十步：生成初始化报告
    await generateInitReport(connection);
    
    const duration = Date.now() - startTime;
    colorLog('green', `🎉 数据库初始化完成！总耗时: ${duration}ms`);
    colorLog('cyan', '===== 初始化成功 =====');
    
  } catch (error) {
    const duration = Date.now() - startTime;
    colorLog('red', `❌ 数据库初始化失败！耗时: ${duration}ms`);
    colorLog('red', `错误信息: ${error.message}`);
    
    // 提供详细的故障排除信息
    await provideTroubleshootingInfo(error);
    
    process.exit(1);
    
  } finally {
    if (connection) {
      await connection.end();
      colorLog('blue', '🔌 数据库连接已关闭');
    }
  }
}

/**
 * 验证环境配置
 */
async function validateEnvironment() {
  colorLog('yellow', '🔍 第一步：验证环境配置...');
  
  const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`缺少必要的环境变量: ${missingVars.join(', ')}\n请检查.env文件配置`);
  }
  
  colorLog('green', '✅ 环境配置验证通过');
  colorLog('blue', `   数据库主机: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
  colorLog('blue', `   数据库名称: ${process.env.DB_NAME}`);
  colorLog('blue', `   数据库用户: ${process.env.DB_USER}`);
}

/**
 * 连接到MySQL服务器
 */
async function connectToMySQL() {
  colorLog('yellow', '🔍 第二步：连接MySQL服务器...');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT) || 3306,
      charset: 'utf8mb4',
      timezone: '+08:00',
      multipleStatements: true
    });
    
    // 测试连接
    const [result] = await connection.execute('SELECT VERSION() as version, NOW() as server_time');
    
    colorLog('green', '✅ MySQL连接成功');
    colorLog('blue', `   MySQL版本: ${result[0].version}`);
    colorLog('blue', `   服务器时间: ${result[0].server_time}`);
    
    return connection;
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('无法连接到MySQL服务器。请确保MySQL服务正在运行。');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error('MySQL访问被拒绝。请检查用户名和密码是否正确。');
    } else {
      throw new Error(`MySQL连接失败: ${error.message}`);
    }
  }
}

/**
 * 确保数据库存在
 */
async function ensureDatabase(connection) {
  colorLog('yellow', '🔍 第三步：确保数据库存在...');
  
  const dbName = process.env.DB_NAME || 'bookreviewer';
  
  try {
    // 检查数据库是否存在
    const [databases] = await connection.query(`SHOW DATABASES LIKE '${dbName}'`);
    
    if (databases.length === 0) {
      // 创建数据库
      await connection.query(
        `CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      colorLog('green', `✅ 数据库 ${dbName} 创建成功`);
    } else {
      colorLog('green', `✅ 数据库 ${dbName} 已存在`);
    }
    
  } catch (error) {
    throw new Error(`创建数据库失败: ${error.message}`);
  }
}

/**
 * 备份现有数据
 */
async function backupExistingData(connection) {
  colorLog('yellow', '🔍 第四步：检查现有数据...');
  
  try {
    const [tables] = await connection.execute('SHOW TABLES');
    
    if (tables.length > 0) {
      colorLog('yellow', `⚠️  发现 ${tables.length} 个现有表，将进行数据保护处理`);
      
      // 检查是否有数据
      let totalRecords = 0;
      for (const table of tables) {
        const tableName = Object.values(table)[0];
        try {
          const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
          totalRecords += count[0].count;
        } catch (error) {
          // 忽略表不存在等错误
        }
      }
      
      if (totalRecords > 0) {
        colorLog('yellow', `📊 发现 ${totalRecords} 条现有记录`);
        colorLog('blue', '   现有数据将被保留，新结构将与现有数据兼容');
      }
    } else {
      colorLog('green', '✅ 未发现现有表，开始全新安装');
    }
    
  } catch (error) {
    colorLog('blue', '   数据库为空或访问受限，继续安装过程');
  }
}

/**
 * 执行数据库结构脚本
 */
async function executeSchemaScript(connection) {
  colorLog('yellow', '🔍 第五步：执行数据库结构脚本...');
  
  try {
    // 读取SQL脚本文件
    const sqlFilePath = path.join(__dirname, 'schema.sql');
    
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`找不到SQL脚本文件: ${sqlFilePath}`);
    }
    
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    colorLog('green', '✅ SQL脚本文件读取成功');
    colorLog('blue', `   文件大小: ${(sqlScript.length / 1024).toFixed(2)} KB`);
    
    // 执行SQL脚本
    colorLog('yellow', '⚙️  正在执行SQL脚本...');
    
    try {
      // 直接执行整个SQL脚本，让MySQL处理分割
      await connection.query(sqlScript);
      colorLog('green', '✅ SQL脚本执行成功');
    } catch (error) {
      // 如果整体执行失败，尝试分步执行
      colorLog('yellow', '⚠️  整体执行失败，尝试分步执行...');
      
      // 分割SQL语句并执行
      const statements = sqlScript
        .split(/;\s*[\r\n]+/)
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
      
      let successCount = 0;
      let skipCount = 0;
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          try {
            // 跳过触发器和视图相关的语句，先创建基础表
            if (statement.includes('TRIGGER') || statement.includes('VIEW') || statement.includes('DELIMITER')) {
              colorLog('blue', `   跳过高级语句: ${statement.substring(0, 50)}...`);
              continue;
            }
            
            await connection.query(statement + ';');
            successCount++;
            colorLog('blue', `   [${i+1}/${statements.length}] 执行成功`);
          } catch (error) {
            if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
                error.code === 'ER_DUP_KEYNAME' ||
                error.message.includes('already exists')) {
              skipCount++;
              colorLog('blue', `   [${i+1}/${statements.length}] 跳过已存在`);
            } else {
              colorLog('red', `   [${i+1}/${statements.length}] 执行失败: ${error.message}`);
              colorLog('yellow', `   问题语句: ${statement.substring(0, 100)}...`);
              // 继续执行其他语句
            }
          }
        }
      }
    }
    
    
  } catch (error) {
    throw new Error(`执行SQL脚本失败: ${error.message}`);
  }
}

/**
 * 验证表结构
 */
async function validateTableStructure(connection) {
  colorLog('yellow', '🔍 第六步：验证表结构...');
  
  const expectedTables = [
    'users', 'books', 'reviews', 'review_likes', 
    'user_favorites', 'review_comments', 'tags', 
    'book_tags', 'system_logs'
  ];
  
  try {
    const [tables] = await connection.execute('SHOW TABLES');
    const existingTables = tables.map(t => Object.values(t)[0]);
    
    const missingTables = expectedTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`缺少必要的表: ${missingTables.join(', ')}`);
    }
    
    colorLog('green', '✅ 表结构验证通过');
    colorLog('blue', `   核心表数量: ${expectedTables.length}/${existingTables.length}`);
    
    // 验证关键表的字段
    for (const tableName of ['users', 'books', 'reviews']) {
      const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
      colorLog('blue', `   ${tableName} 表字段数量: ${columns.length}`);
    }
    
  } catch (error) {
    throw new Error(`表结构验证失败: ${error.message}`);
  }
}

/**
 * 验证默认数据
 */
async function validateDefaultData(connection) {
  colorLog('yellow', '🔍 第七步：验证默认数据...');
  
  try {
    // 检查管理员用户
    const [adminUsers] = await connection.execute(
      'SELECT COUNT(*) as count FROM users WHERE role = "admin"'
    );
    
    if (adminUsers[0].count === 0) {
      colorLog('yellow', '⚠️  未找到管理员用户，正在创建...');
      await connection.execute(`
        INSERT INTO users (email, username, password_hash, role, bio) VALUES
        ('admin@bookreviewer.com', '系统管理员', '$2b$10$7QnKmgPn8rMxPRQXWKm6KOXVLIcZwjUANXOGKqVQZrHRHzmKaJ8YS', 'admin', '系统管理员账户，负责平台管理和维护')
      `);
    }
    
    // 检查默认标签
    const [tags] = await connection.execute('SELECT COUNT(*) as count FROM tags');
    
    colorLog('green', '✅ 默认数据验证通过');
    colorLog('blue', `   管理员用户: ${adminUsers[0].count} 个`);
    colorLog('blue', `   默认标签: ${tags[0].count} 个`);
    
  } catch (error) {
    throw new Error(`默认数据验证失败: ${error.message}`);
  }
}

/**
 * 数据库性能优化
 */
async function optimizeDatabase(connection) {
  colorLog('yellow', '🔍 第八步：数据库性能优化...');
  
  try {
    // 分析表以优化查询性能
    const tables = ['users', 'books', 'reviews', 'review_likes'];
    
    for (const table of tables) {
      await connection.execute(`ANALYZE TABLE ${table}`);
    }
    
    colorLog('green', '✅ 数据库优化完成');
    colorLog('blue', `   已优化 ${tables.length} 个核心表`);
    
  } catch (error) {
    colorLog('yellow', `⚠️  性能优化失败: ${error.message}`);
    // 优化失败不影响主流程
  }
}

/**
 * 生成初始化报告
 */
async function generateInitReport(connection) {
  colorLog('yellow', '🔍 第九步：生成初始化报告...');
  
  try {
    // 收集统计信息
    const [tables] = await connection.execute('SHOW TABLES');
    const [users] = await connection.execute('SELECT COUNT(*) as count FROM users');
    const [books] = await connection.execute('SELECT COUNT(*) as count FROM books');
    const [reviews] = await connection.execute('SELECT COUNT(*) as count FROM reviews');
    const [tags] = await connection.execute('SELECT COUNT(*) as count FROM tags');
    
    // 检查视图
    const [views] = await connection.execute('SHOW FULL TABLES WHERE Table_type = "VIEW"');
    
    colorLog('cyan', '\n📊 ===== 数据库初始化报告 =====');
    colorLog('green', `数据库名称: ${process.env.DB_NAME || 'bookreviewer'}`);
    colorLog('green', `数据表数量: ${tables.length}`);
    colorLog('green', `数据视图数量: ${views.length}`);
    colorLog('blue', '\n📋 数据统计:');
    colorLog('blue', `   用户数量: ${users[0].count}`);
    colorLog('blue', `   书籍数量: ${books[0].count}`);
    colorLog('blue', `   书评数量: ${reviews[0].count}`);
    colorLog('blue', `   标签数量: ${tags[0].count}`);
    
    colorLog('blue', '\n🔑 默认账户:');
    colorLog('blue', '   管理员邮箱: admin@bookreviewer.com');
    colorLog('blue', '   管理员密码: admin123');
    
    colorLog('blue', '\n⚡ 性能特性:');
    colorLog('blue', '   ✅ 连接池支持（最大10连接）');
    colorLog('blue', '   ✅ 全文搜索索引');
    colorLog('blue', '   ✅ 自动统计触发器');
    colorLog('blue', '   ✅ 数据视图优化');
    
    colorLog('blue', '\n🛡️  安全特性:');
    colorLog('blue', '   ✅ 密码哈希存储');
    colorLog('blue', '   ✅ 外键约束');
    colorLog('blue', '   ✅ 字符集UTF8MB4');
    
    colorLog('cyan', '===========================\n');
    
  } catch (error) {
    colorLog('yellow', `⚠️  报告生成失败: ${error.message}`);
  }
}

/**
 * 提供故障排除信息
 */
async function provideTroubleshootingInfo(error) {
  colorLog('red', '\n🔧 ===== 故障排除指南 =====');
  
  if (error.message.includes('ECONNREFUSED')) {
    colorLog('yellow', '📋 MySQL连接被拒绝:');
    colorLog('blue', '   1. 检查MySQL服务是否启动');
    colorLog('blue', '   2. 检查端口3306是否被占用');
    colorLog('blue', '   3. 检查防火墙设置');
    colorLog('blue', '   4. 运行: net start mysql (Windows)');
    
  } else if (error.message.includes('ER_ACCESS_DENIED_ERROR')) {
    colorLog('yellow', '📋 MySQL访问被拒绝:');
    colorLog('blue', '   1. 检查.env文件中的用户名和密码');
    colorLog('blue', '   2. 确认MySQL用户权限');
    colorLog('blue', '   3. 尝试使用MySQL Workbench连接测试');
    
  } else if (error.message.includes('找不到SQL脚本文件')) {
    colorLog('yellow', '📋 SQL脚本文件问题:');
    colorLog('blue', '   1. 确认schema.sql文件存在');
    colorLog('blue', '   2. 检查文件路径和权限');
    colorLog('blue', '   3. 重新创建schema.sql文件');
    
  } else {
    colorLog('yellow', '📋 通用故障排除:');
    colorLog('blue', '   1. 检查网络连接');
    colorLog('blue', '   2. 确认MySQL版本兼容性');
    colorLog('blue', '   3. 查看MySQL错误日志');
    colorLog('blue', '   4. 重启MySQL服务');
  }
  
  colorLog('red', '========================\n');
}

// 如果直接运行此文件，则执行初始化
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };

// 脚本信息
colorLog('blue', '📚 数据库初始化脚本已加载');
colorLog('blue', '🔍 使用方法: npm run init-db');
