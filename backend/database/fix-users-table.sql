-- 修复 users 表结构，确保所有必需字段都存在
USE bookreviewer;

-- 1. 添加 signature 字段（如果不存在）
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'bookreviewer' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'signature');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE users ADD COLUMN signature VARCHAR(30) COMMENT ''个人签名，最多30字符'' AFTER bio',
    'SELECT ''signature 字段已存在'' AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 添加 privacy_settings 字段（如果不存在）
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'bookreviewer' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'privacy_settings');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE users ADD COLUMN privacy_settings JSON COMMENT ''隐私设置'' AFTER signature',
    'SELECT ''privacy_settings 字段已存在'' AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 为现有用户设置默认隐私设置（如果为 NULL）
UPDATE users 
SET privacy_settings = '{"avatar":true,"signature":true,"stats":true,"history":true}'
WHERE privacy_settings IS NULL;

-- 4. 显示修复后的表结构
SELECT '✅ users 表结构修复完成！' AS status;
SHOW COLUMNS FROM users;

