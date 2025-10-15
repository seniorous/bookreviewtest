-- 为 users 表添加 signature 字段
USE bookreviewer;

-- 先检查字段是否已存在，如果不存在则添加
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'bookreviewer' 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'signature'
);

-- 如果字段不存在，则添加
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE users ADD COLUMN signature VARCHAR(30) COMMENT ''个人签名，最多30字符'' AFTER bio',
    'SELECT ''字段已存在'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 显示结果
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    CHARACTER_MAXIMUM_LENGTH, 
    COLUMN_COMMENT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'bookreviewer' 
AND TABLE_NAME = 'users' 
AND COLUMN_NAME = 'signature';

