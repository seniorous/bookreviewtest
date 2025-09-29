-- 书评管理系统数据库结构
-- 创建时间: 2024年
-- 设计目标: 支持完整的书评管理和用户交互功能

-- 1. 用户表（支持个人主页功能）
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user' COMMENT '用户角色：user=普通用户, admin=管理员',
    avatar_url TEXT COMMENT '用户头像URL',
    bio TEXT COMMENT '用户简介',
    status ENUM('active', 'banned') DEFAULT 'active' COMMENT '用户状态',
    total_reviews INT DEFAULT 0 COMMENT '发布的书评总数',
    total_likes_received INT DEFAULT 0 COMMENT '收到的点赞总数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户信息表';

-- 2. 书籍表（暂不包含分类，保持简洁）
CREATE TABLE IF NOT EXISTS books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(20) COMMENT 'ISBN编号',
    cover_url TEXT COMMENT '封面图片URL',
    description TEXT COMMENT '书籍简介',
    publish_year YEAR COMMENT '出版年份',
    publisher VARCHAR(255) COMMENT '出版社',
    total_reviews INT DEFAULT 0 COMMENT '书评总数',
    average_rating DECIMAL(3,2) DEFAULT 0.00 COMMENT '平均评分',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_title (title),
    INDEX idx_author (author),
    INDEX idx_isbn (isbn),
    INDEX idx_publish_year (publish_year),
    FULLTEXT idx_search (title, author, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书籍信息表';

-- 3. 书评表（支持审核、浏览统计等功能）
CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    book_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    rating TINYINT NOT NULL CHECK(rating >= 1 AND rating <= 5),
    status ENUM('pending', 'approved', 'rejected', 'hidden') DEFAULT 'approved' COMMENT '审核状态',
    views INT DEFAULT 0 COMMENT '浏览次数',
    likes_count INT DEFAULT 0 COMMENT '点赞数量',
    comments_count INT DEFAULT 0 COMMENT '评论数量',
    is_featured BOOLEAN DEFAULT FALSE COMMENT '是否为精选书评',
    admin_note TEXT COMMENT '管理员备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    
    INDEX idx_user_id (user_id),
    INDEX idx_book_id (book_id),
    INDEX idx_status (status),
    INDEX idx_rating (rating),
    INDEX idx_created_at (created_at),
    INDEX idx_likes_count (likes_count),
    INDEX idx_views (views),
    FULLTEXT idx_content (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书评表';

-- 4. 书评点赞表
CREATE TABLE IF NOT EXISTS review_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    review_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_like (user_id, review_id),
    INDEX idx_user_id (user_id),
    INDEX idx_review_id (review_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书评点赞表';

-- 5. 用户收藏表
CREATE TABLE IF NOT EXISTS user_favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    review_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_favorite (user_id, review_id),
    INDEX idx_user_id (user_id),
    INDEX idx_review_id (review_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户收藏表';

-- 6. 书评评论表
CREATE TABLE IF NOT EXISTS review_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    review_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_id INT NULL COMMENT '父评论ID，支持回复功能',
    content TEXT NOT NULL,
    status ENUM('approved', 'pending', 'rejected') DEFAULT 'approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES review_comments(id) ON DELETE CASCADE,
    
    INDEX idx_review_id (review_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_id (parent_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书评评论表';

-- 7. 标签表（支持书籍标签系统）
CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7) DEFAULT '#007bff' COMMENT '标签颜色',
    usage_count INT DEFAULT 0 COMMENT '使用次数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_usage_count (usage_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签表';

-- 8. 书籍标签关联表
CREATE TABLE IF NOT EXISTS book_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    tag_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_book_tag (book_id, tag_id),
    INDEX idx_book_id (book_id),
    INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书籍标签关联表';

-- 9. 系统日志表（用于管理员Dashboard）
CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL COMMENT '操作类型',
    target_type VARCHAR(50) COMMENT '操作对象类型（user/book/review等）',
    target_id INT COMMENT '操作对象ID',
    details JSON COMMENT '详细信息',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    user_agent TEXT COMMENT '用户代理',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统操作日志表';

-- 插入默认数据

-- 创建默认管理员用户（密码：admin123，哈希值为bcrypt加密）
INSERT IGNORE INTO users (email, username, password_hash, role, bio) VALUES
('admin@bookreviewer.com', '系统管理员', '$2b$10$7QnKmgPn8rMxPRQXWKm6KOXVLIcZwjUANXOGKqVQZrHRHzmKaJ8YS', 'admin', '系统管理员账户，负责平台管理和维护');

-- 插入默认标签
INSERT IGNORE INTO tags (name, description, color) VALUES
('文学经典', '经典文学作品', '#e74c3c'),
('科幻', '科幻类作品', '#9b59b6'),
('悬疑推理', '悬疑推理类', '#3498db'),
('历史', '历史相关', '#f39c12'),
('传记', '人物传记', '#2ecc71'),
('心理学', '心理学相关', '#e67e22'),
('哲学', '哲学思辨', '#34495e'),
('技术', '技术类书籍', '#16a085'),
('励志', '励志成长', '#f1c40f'),
('小说', '小说类', '#e91e63');

-- 创建触发器：自动更新统计数据

-- 触发器：书评点赞时更新计数
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS update_review_likes_count 
AFTER INSERT ON review_likes 
FOR EACH ROW 
BEGIN
    UPDATE reviews SET likes_count = likes_count + 1 WHERE id = NEW.review_id;
    UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = (SELECT user_id FROM reviews WHERE id = NEW.review_id);
END$$

-- 触发器：取消点赞时更新计数
CREATE TRIGGER IF NOT EXISTS update_review_likes_count_delete 
AFTER DELETE ON review_likes 
FOR EACH ROW 
BEGIN
    UPDATE reviews SET likes_count = likes_count - 1 WHERE id = OLD.review_id;
    UPDATE users SET total_likes_received = total_likes_received - 1 WHERE id = (SELECT user_id FROM reviews WHERE id = OLD.review_id);
END$$

-- 触发器：新增书评时更新统计
CREATE TRIGGER IF NOT EXISTS update_book_stats_insert 
AFTER INSERT ON reviews 
FOR EACH ROW 
BEGIN
    UPDATE books SET 
        total_reviews = total_reviews + 1,
        average_rating = (SELECT AVG(rating) FROM reviews WHERE book_id = NEW.book_id AND status = 'approved')
    WHERE id = NEW.book_id;
    
    UPDATE users SET total_reviews = total_reviews + 1 WHERE id = NEW.user_id;
END$$

-- 触发器：删除书评时更新统计
CREATE TRIGGER IF NOT EXISTS update_book_stats_delete 
AFTER DELETE ON reviews 
FOR EACH ROW 
BEGIN
    UPDATE books SET 
        total_reviews = total_reviews - 1,
        average_rating = COALESCE((SELECT AVG(rating) FROM reviews WHERE book_id = OLD.book_id AND status = 'approved'), 0)
    WHERE id = OLD.book_id;
    
    UPDATE users SET total_reviews = total_reviews - 1 WHERE id = OLD.user_id;
END$$

-- 触发器：新增评论时更新计数
CREATE TRIGGER IF NOT EXISTS update_comment_count_insert 
AFTER INSERT ON review_comments 
FOR EACH ROW 
BEGIN
    UPDATE reviews SET comments_count = comments_count + 1 WHERE id = NEW.review_id;
END$$

-- 触发器：删除评论时更新计数
CREATE TRIGGER IF NOT EXISTS update_comment_count_delete 
AFTER DELETE ON review_comments 
FOR EACH ROW 
BEGIN
    UPDATE reviews SET comments_count = comments_count - 1 WHERE id = OLD.review_id;
END$$

DELIMITER ;

-- 创建视图：便于数据查询和统计

-- 书评详情视图（包含用户和书籍信息）
CREATE OR REPLACE VIEW review_details AS
SELECT 
    r.id,
    r.title,
    r.content,
    r.rating,
    r.status,
    r.views,
    r.likes_count,
    r.comments_count,
    r.is_featured,
    r.created_at,
    r.updated_at,
    u.username as author_name,
    u.avatar_url as author_avatar,
    b.title as book_title,
    b.author as book_author,
    b.cover_url as book_cover
FROM reviews r
JOIN users u ON r.user_id = u.id
JOIN books b ON r.book_id = b.id;

-- 用户统计视图
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.avatar_url,
    u.bio,
    u.total_reviews,
    u.total_likes_received,
    u.created_at,
    COUNT(DISTINCT f.id) as favorites_count,
    COUNT(DISTINCT l.id) as likes_given_count
FROM users u
LEFT JOIN user_favorites f ON u.id = f.user_id
LEFT JOIN review_likes l ON u.id = l.user_id
WHERE u.status = 'active'
GROUP BY u.id;
