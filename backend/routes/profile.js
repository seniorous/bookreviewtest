/**
 * 个人主页相关API路由
 * 功能：用户资料管理、头像上传、隐私设置等
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const mysql = require('../database/mysql');

const router = express.Router();

// 配置头像上传
const avatarStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/avatars');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `avatar_${req.user.id}_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只支持 JPG、PNG、GIF 格式的图片'));
        }
    }
});

/**
 * 获取当前用户资料
 * GET /api/profile
 */
router.get('/', optionalAuth, async (req, res) => {
    const requestId = Date.now();
    console.log(`📡 [${new Date().toLocaleString()}] GET /api/profile/me - ${req.ip}`);
    
    try {
        const targetUserId = req.user ? req.user.id : null;
        
        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                message: '请提供用户ID或登录后访问'
            });
        }
        
        const isOwnProfile = req.user && req.user.id == targetUserId;
        
        console.log(`🔍 获取用户资料，目标用户ID: ${targetUserId}, 是否本人: ${isOwnProfile}`);
        
        // 获取用户基本信息
        const userQuery = `
            SELECT 
                id, username, email, avatar_url, bio, signature, 
                privacy_settings, total_reviews, total_likes_received,
                created_at, updated_at
            FROM users 
            WHERE id = ? AND status = 'active'
        `;
        
        console.log('🔍 执行SQL查询:', userQuery);
        console.log('📋 查询参数:', [targetUserId]);
        
        const connection = await mysql.getConnection();
        console.log('🔗 获取数据库连接，连接ID:', connection.threadId);
        
        try {
            const [userRows] = await connection.execute(userQuery, [targetUserId]);
            
            if (userRows.length === 0) {
                console.log('❌ 用户不存在或已被禁用');
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }
            
            const user = userRows[0];
            console.log('✅ 用户基本信息获取成功:', user.username);
            
            // 解析隐私设置
            let privacySettings = { avatar: true, signature: true, stats: true, history: true };
            if (user.privacy_settings) {
                try {
                    privacySettings = JSON.parse(user.privacy_settings);
                } catch (e) {
                    console.log('⚠️ 隐私设置JSON解析失败，使用默认设置');
                }
            }
            
            // 检查隐私权限
            const canViewStats = isOwnProfile || privacySettings.stats;
            const canViewHistory = isOwnProfile || privacySettings.history;
            
            // 获取统计数据
            let stats = {
                reviews_count: 0,
                likes_received: 0,
                favorites_count: 0,
                favorites_received: 0,
                comments_count: 0
            };
            
            if (canViewStats) {
                console.log('📊 获取用户统计数据...');
                
                // 获取收藏数量
                const favoritesQuery = `
                    SELECT COUNT(*) as favorites_count 
                    FROM user_favorites 
                    WHERE user_id = ?
                `;
                const [favoritesRows] = await connection.execute(favoritesQuery, [targetUserId]);
                
                // 获取被收藏数量
                const favoritesReceivedQuery = `
                    SELECT COUNT(*) as favorites_received 
                    FROM user_favorites uf
                    JOIN reviews r ON uf.review_id = r.id
                    WHERE r.user_id = ?
                `;
                const [favoritesReceivedRows] = await connection.execute(favoritesReceivedQuery, [targetUserId]);
                
                // 获取评论数量
                const commentsQuery = `
                    SELECT COUNT(*) as comments_count 
                    FROM review_comments 
                    WHERE user_id = ? AND status = 'approved'
                `;
                const [commentsRows] = await connection.execute(commentsQuery, [targetUserId]);
                
                stats = {
                    reviews_count: user.total_reviews || 0,
                    likes_received: user.total_likes_received || 0,
                    favorites_count: favoritesRows[0].favorites_count || 0,
                    favorites_received: favoritesReceivedRows[0].favorites_received || 0,
                    comments_count: commentsRows[0].comments_count || 0
                };
                
                console.log('📊 统计数据获取成功:', stats);
            }
            
            // 获取历史记录
            let history = { reviews: [], favorites: [], comments: [] };
            
            if (canViewHistory) {
                console.log('📚 获取用户历史记录...');
                
                // 我的书评（最近10条）
                const reviewsQuery = `
                    SELECT r.id, r.title, r.rating, r.views, r.likes_count, 
                           r.comments_count, r.created_at,
                           b.title as book_title, b.author as book_author, b.cover_url as book_cover
                    FROM reviews r
                    JOIN books b ON r.book_id = b.id
                    WHERE r.user_id = ? AND r.status = 'approved'
                    ORDER BY r.created_at DESC
                    LIMIT 10
                `;
                const [reviewsRows] = await connection.execute(reviewsQuery, [targetUserId]);
                history.reviews = reviewsRows;
                
                // 我的收藏（最近10条）
                const myFavoritesQuery = `
                    SELECT r.id, r.title, r.rating, r.views, r.likes_count, 
                           r.comments_count, uf.created_at as favorited_at,
                           b.title as book_title, b.author as book_author, b.cover_url as book_cover,
                           u.username as author_name
                    FROM user_favorites uf
                    JOIN reviews r ON uf.review_id = r.id
                    JOIN books b ON r.book_id = b.id
                    JOIN users u ON r.user_id = u.id
                    WHERE uf.user_id = ? AND r.status = 'approved'
                    ORDER BY uf.created_at DESC
                    LIMIT 10
                `;
                const [myFavoritesRows] = await connection.execute(myFavoritesQuery, [targetUserId]);
                history.favorites = myFavoritesRows;
                
                // 我的评论（最近10条）
                const myCommentsQuery = `
                    SELECT rc.id, rc.content, rc.created_at,
                           r.id as review_id, r.title as review_title,
                           b.title as book_title, b.author as book_author
                    FROM review_comments rc
                    JOIN reviews r ON rc.review_id = r.id
                    JOIN books b ON r.book_id = b.id
                    WHERE rc.user_id = ? AND rc.status = 'approved'
                    ORDER BY rc.created_at DESC
                    LIMIT 10
                `;
                const [myCommentsRows] = await connection.execute(myCommentsQuery, [targetUserId]);
                history.comments = myCommentsRows;
                
                console.log('📚 历史记录获取成功');
            }
            
            // 构建响应数据
            const responseData = {
                user: {
                    id: user.id,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    bio: user.bio,
                    signature: (isOwnProfile || privacySettings.signature) ? user.signature : null,
                    created_at: user.created_at,
                    privacy_settings: isOwnProfile ? privacySettings : null
                },
                stats: canViewStats ? stats : null,
                history: canViewHistory ? history : null,
                is_own_profile: isOwnProfile
            };
            
            console.log('✅ 用户资料获取完成');
            
            res.json({
                success: true,
                data: responseData
            });
            
        } finally {
            connection.release();
            console.log('🔓 释放数据库连接，连接ID:', connection.threadId);
        }
        
        console.log(`🟢 [${new Date().toLocaleString()}] GET /api/profile/${req.params.userId || 'me'} - 200`);
        
    } catch (error) {
        console.error('❌ 获取用户资料失败:', error);
        res.status(500).json({
            success: false,
            message: '获取用户资料失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
        
        console.log(`🔴 [${new Date().toLocaleString()}] GET /api/profile/me - 500`);
    }
});

/**
 * 获取指定用户的资料
 * GET /api/profile/:userId
 */
router.get('/:userId', optionalAuth, async (req, res) => {
    const requestId = Date.now();
    console.log(`📡 [${new Date().toLocaleString()}] GET /api/profile/${req.params.userId} - ${req.ip}`);
    
    try {
        const targetUserId = req.params.userId;
        const isOwnProfile = req.user && req.user.id == targetUserId;
        
        console.log(`🔍 获取用户资料，目标用户ID: ${targetUserId}, 是否本人: ${isOwnProfile}`);
        
        // 获取用户基本信息
        const userQuery = `
            SELECT 
                id, username, email, avatar_url, bio, signature, 
                privacy_settings, total_reviews, total_likes_received,
                created_at, updated_at
            FROM users 
            WHERE id = ? AND status = 'active'
        `;
        
        console.log('🔍 执行SQL查询:', userQuery);
        console.log('📋 查询参数:', [targetUserId]);
        
        const connection = await mysql.getConnection();
        console.log('🔗 获取数据库连接，连接ID:', connection.threadId);
        
        try {
            const [userRows] = await connection.execute(userQuery, [targetUserId]);
            
            if (userRows.length === 0) {
                console.log('❌ 用户不存在或已被禁用');
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }
            
            const user = userRows[0];
            console.log('✅ 用户基本信息获取成功:', user.username);
            
            // 解析隐私设置
            let privacySettings = { avatar: true, signature: true, stats: true, history: true };
            if (user.privacy_settings) {
                try {
                    privacySettings = JSON.parse(user.privacy_settings);
                } catch (e) {
                    console.log('⚠️ 隐私设置JSON解析失败，使用默认设置');
                }
            }
            
            // 检查隐私权限
            const canViewStats = isOwnProfile || privacySettings.stats;
            const canViewHistory = isOwnProfile || privacySettings.history;
            
            // 获取统计数据
            let stats = {
                reviews_count: 0,
                likes_received: 0,
                favorites_count: 0,
                favorites_received: 0,
                comments_count: 0
            };
            
            if (canViewStats) {
                console.log('📊 获取用户统计数据...');
                
                // 获取收藏数量
                const favoritesQuery = `
                    SELECT COUNT(*) as favorites_count 
                    FROM user_favorites 
                    WHERE user_id = ?
                `;
                const [favoritesRows] = await connection.execute(favoritesQuery, [targetUserId]);
                
                // 获取被收藏数量
                const favoritesReceivedQuery = `
                    SELECT COUNT(*) as favorites_received 
                    FROM user_favorites uf
                    JOIN reviews r ON uf.review_id = r.id
                    WHERE r.user_id = ?
                `;
                const [favoritesReceivedRows] = await connection.execute(favoritesReceivedQuery, [targetUserId]);
                
                // 获取评论数量
                const commentsQuery = `
                    SELECT COUNT(*) as comments_count 
                    FROM review_comments 
                    WHERE user_id = ? AND status = 'approved'
                `;
                const [commentsRows] = await connection.execute(commentsQuery, [targetUserId]);
                
                stats = {
                    reviews_count: user.total_reviews || 0,
                    likes_received: user.total_likes_received || 0,
                    favorites_count: favoritesRows[0].favorites_count || 0,
                    favorites_received: favoritesReceivedRows[0].favorites_received || 0,
                    comments_count: commentsRows[0].comments_count || 0
                };
                
                console.log('📊 统计数据获取成功:', stats);
            }
            
            // 获取历史记录
            let history = { reviews: [], favorites: [], comments: [] };
            
            if (canViewHistory) {
                console.log('📚 获取用户历史记录...');
                
                // 我的书评（最近10条）
                const reviewsQuery = `
                    SELECT r.id, r.title, r.rating, r.views, r.likes_count, 
                           r.comments_count, r.created_at,
                           b.title as book_title, b.author as book_author, b.cover_url as book_cover
                    FROM reviews r
                    JOIN books b ON r.book_id = b.id
                    WHERE r.user_id = ? AND r.status = 'approved'
                    ORDER BY r.created_at DESC
                    LIMIT 10
                `;
                const [reviewsRows] = await connection.execute(reviewsQuery, [targetUserId]);
                history.reviews = reviewsRows;
                
                // 我的收藏（最近10条）
                const myFavoritesQuery = `
                    SELECT r.id, r.title, r.rating, r.views, r.likes_count, 
                           r.comments_count, uf.created_at as favorited_at,
                           b.title as book_title, b.author as book_author, b.cover_url as book_cover,
                           u.username as author_name
                    FROM user_favorites uf
                    JOIN reviews r ON uf.review_id = r.id
                    JOIN books b ON r.book_id = b.id
                    JOIN users u ON r.user_id = u.id
                    WHERE uf.user_id = ? AND r.status = 'approved'
                    ORDER BY uf.created_at DESC
                    LIMIT 10
                `;
                const [myFavoritesRows] = await connection.execute(myFavoritesQuery, [targetUserId]);
                history.favorites = myFavoritesRows;
                
                // 我的评论（最近10条）
                const myCommentsQuery = `
                    SELECT rc.id, rc.content, rc.created_at,
                           r.id as review_id, r.title as review_title,
                           b.title as book_title, b.author as book_author
                    FROM review_comments rc
                    JOIN reviews r ON rc.review_id = r.id
                    JOIN books b ON r.book_id = b.id
                    WHERE rc.user_id = ? AND rc.status = 'approved'
                    ORDER BY rc.created_at DESC
                    LIMIT 10
                `;
                const [myCommentsRows] = await connection.execute(myCommentsQuery, [targetUserId]);
                history.comments = myCommentsRows;
                
                console.log('📚 历史记录获取成功');
            }
            
            // 构建响应数据
            const responseData = {
                user: {
                    id: user.id,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    bio: user.bio,
                    signature: (isOwnProfile || privacySettings.signature) ? user.signature : null,
                    created_at: user.created_at,
                    privacy_settings: isOwnProfile ? privacySettings : null
                },
                stats: canViewStats ? stats : null,
                history: canViewHistory ? history : null,
                is_own_profile: isOwnProfile
            };
            
            console.log('✅ 用户资料获取完成');
            
            res.json({
                success: true,
                data: responseData
            });
            
        } finally {
            connection.release();
            console.log('🔓 释放数据库连接，连接ID:', connection.threadId);
        }
        
        console.log(`🟢 [${new Date().toLocaleString()}] GET /api/profile/${req.params.userId} - 200`);
        
    } catch (error) {
        console.error('❌ 获取用户资料失败:', error);
        res.status(500).json({
            success: false,
            message: '获取用户资料失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
        
        console.log(`🔴 [${new Date().toLocaleString()}] GET /api/profile/${req.params.userId} - 500`);
    }
});

/**
 * 更新用户资料
 * PUT /api/profile
 * 需要登录
 */
router.put('/', authenticateToken, async (req, res) => {
    console.log(`📡 [${new Date().toLocaleString()}] PUT /api/profile - ${req.ip}`);
    
    try {
        const { signature, privacy_settings } = req.body;
        const userId = req.user.id;
        
        console.log('🔍 更新用户资料，用户ID:', userId);
        console.log('📋 更新数据:', { signature, privacy_settings });
        
        // 验证签名长度
        if (signature && signature.length > 30) {
            return res.status(400).json({
                success: false,
                message: '个人签名不能超过30个字符'
            });
        }
        
        // 验证隐私设置格式
        if (privacy_settings) {
            const requiredFields = ['avatar', 'signature', 'stats', 'history'];
            for (const field of requiredFields) {
                if (!(field in privacy_settings) || typeof privacy_settings[field] !== 'boolean') {
                    return res.status(400).json({
                        success: false,
                        message: '隐私设置格式不正确'
                    });
                }
            }
        }
        
        const connection = await mysql.getConnection();
        console.log('🔗 获取数据库连接，连接ID:', connection.threadId);
        
        try {
            // 构建更新SQL
            const updateFields = [];
            const updateValues = [];
            
            if (signature !== undefined) {
                updateFields.push('signature = ?');
                updateValues.push(signature || null);
            }
            
            if (privacy_settings) {
                updateFields.push('privacy_settings = ?');
                updateValues.push(JSON.stringify(privacy_settings));
            }
            
            if (updateFields.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: '没有要更新的字段'
                });
            }
            
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            updateValues.push(userId);
            
            const updateQuery = `
                UPDATE users 
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `;
            
            console.log('🔍 执行SQL更新:', updateQuery);
            console.log('📋 更新参数:', updateValues);
            
            const [result] = await connection.execute(updateQuery, updateValues);
            
            if (result.affectedRows === 0) {
                console.log('❌ 用户不存在或更新失败');
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }
            
            console.log('✅ 用户资料更新成功');
            
            res.json({
                success: true,
                message: '资料更新成功'
            });
            
        } finally {
            connection.release();
            console.log('🔓 释放数据库连接，连接ID:', connection.threadId);
        }
        
        console.log(`🟢 [${new Date().toLocaleString()}] PUT /api/profile - 200`);
        
    } catch (error) {
        console.error('❌ 更新用户资料失败:', error);
        res.status(500).json({
            success: false,
            message: '更新用户资料失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
        
        console.log(`🔴 [${new Date().toLocaleString()}] PUT /api/profile - 500`);
    }
});

/**
 * 上传头像
 * POST /api/profile/avatar
 * 需要登录
 */
router.post('/avatar', authenticateToken, (req, res) => {
    console.log(`📡 [${new Date().toLocaleString()}] POST /api/profile/avatar - ${req.ip}`);
    
    avatarUpload.single('avatar')(req, res, async (err) => {
        if (err) {
            console.error('❌ 头像上传失败:', err.message);
            
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: '文件大小不能超过2MB'
                    });
                }
                if (err.code === 'LIMIT_FILE_COUNT') {
                    return res.status(400).json({
                        success: false,
                        message: '一次只能上传一个文件'
                    });
                }
            }
            
            return res.status(400).json({
                success: false,
                message: err.message || '头像上传失败'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '请选择要上传的头像文件'
            });
        }
        
        try {
            const userId = req.user.id;
            const uploadedFile = req.file;
            
            console.log('📷 处理头像上传，用户ID:', userId);
            console.log('📁 上传文件信息:', {
                filename: uploadedFile.filename,
                size: uploadedFile.size,
                mimetype: uploadedFile.mimetype
            });
            
            // 使用Sharp处理图片：压缩和裁剪为正方形
            const processedFilename = `avatar_${userId}_${Date.now()}_processed.jpg`;
            const processedPath = path.join(__dirname, '../uploads/avatars', processedFilename);
            
            await sharp(uploadedFile.path)
                .resize(300, 300, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({
                    quality: 85,
                    progressive: true
                })
                .toFile(processedPath);
            
            console.log('🖼️ 图片处理完成:', processedFilename);
            
            // 删除原始文件
            try {
                await fs.unlink(uploadedFile.path);
                console.log('🗑️ 原始文件已删除');
            } catch (unlinkError) {
                console.warn('⚠️ 删除原始文件失败:', unlinkError.message);
            }
            
            // 更新数据库中的头像URL
            const avatarUrl = `/uploads/avatars/${processedFilename}`;
            
            const connection = await mysql.getConnection();
            console.log('🔗 获取数据库连接，连接ID:', connection.threadId);
            
            try {
                // 获取用户当前头像，用于后续删除
                const [currentUser] = await connection.execute(
                    'SELECT avatar_url FROM users WHERE id = ?',
                    [userId]
                );
                
                // 更新头像URL
                const updateQuery = `
                    UPDATE users 
                    SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `;
                
                console.log('🔍 执行SQL更新:', updateQuery);
                console.log('📋 更新参数:', [avatarUrl, userId]);
                
                const [result] = await connection.execute(updateQuery, [avatarUrl, userId]);
                
                if (result.affectedRows === 0) {
                    console.log('❌ 用户不存在或更新失败');
                    return res.status(404).json({
                        success: false,
                        message: '用户不存在'
                    });
                }
                
                console.log('✅ 头像URL更新成功');
                
                // 删除旧头像文件（如果不是默认头像）
                if (currentUser.length > 0 && currentUser[0].avatar_url) {
                    const oldAvatarUrl = currentUser[0].avatar_url;
                    if (oldAvatarUrl !== '/uploads/avatars/default.png' && 
                        !oldAvatarUrl.includes('default')) {
                        const oldAvatarPath = path.join(__dirname, '..', oldAvatarUrl);
                        try {
                            await fs.unlink(oldAvatarPath);
                            console.log('🗑️ 旧头像文件已删除:', oldAvatarPath);
                        } catch (unlinkError) {
                            console.warn('⚠️ 删除旧头像文件失败:', unlinkError.message);
                        }
                    }
                }
                
                res.json({
                    success: true,
                    message: '头像上传成功',
                    data: {
                        avatar_url: avatarUrl
                    }
                });
                
            } finally {
                connection.release();
                console.log('🔓 释放数据库连接，连接ID:', connection.threadId);
            }
            
            console.log(`🟢 [${new Date().toLocaleString()}] POST /api/profile/avatar - 200`);
            
        } catch (error) {
            console.error('❌ 头像处理失败:', error);
            
            // 清理上传的文件
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.warn('⚠️ 清理上传文件失败:', unlinkError.message);
                }
            }
            
            res.status(500).json({
                success: false,
                message: '头像处理失败',
                error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
            });
            
            console.log(`🔴 [${new Date().toLocaleString()}] POST /api/profile/avatar - 500`);
        }
    });
});

/**
 * 删除头像（恢复为默认头像）
 * DELETE /api/profile/avatar
 * 需要登录
 */
router.delete('/avatar', authenticateToken, async (req, res) => {
    console.log(`📡 [${new Date().toLocaleString()}] DELETE /api/profile/avatar - ${req.ip}`);
    
    try {
        const userId = req.user.id;
        
        console.log('🗑️ 删除用户头像，用户ID:', userId);
        
        const connection = await mysql.getConnection();
        console.log('🔗 获取数据库连接，连接ID:', connection.threadId);
        
        try {
            // 获取用户当前头像
            const [currentUser] = await connection.execute(
                'SELECT avatar_url FROM users WHERE id = ?',
                [userId]
            );
            
            if (currentUser.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }
            
            const currentAvatarUrl = currentUser[0].avatar_url;
            
            // 更新为默认头像
            const defaultAvatarUrl = '/uploads/avatars/default.svg';
            
            const updateQuery = `
                UPDATE users 
                SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            
            console.log('🔍 执行SQL更新:', updateQuery);
            console.log('📋 更新参数:', [defaultAvatarUrl, userId]);
            
            const [result] = await connection.execute(updateQuery, [defaultAvatarUrl, userId]);
            
            if (result.affectedRows === 0) {
                console.log('❌ 头像更新失败');
                return res.status(500).json({
                    success: false,
                    message: '头像删除失败'
                });
            }
            
            console.log('✅ 头像URL重置为默认值');
            
            // 删除旧头像文件（如果不是默认头像）
            if (currentAvatarUrl && 
                currentAvatarUrl !== defaultAvatarUrl && 
                !currentAvatarUrl.includes('default')) {
                const oldAvatarPath = path.join(__dirname, '..', currentAvatarUrl);
                try {
                    await fs.unlink(oldAvatarPath);
                    console.log('🗑️ 旧头像文件已删除:', oldAvatarPath);
                } catch (unlinkError) {
                    console.warn('⚠️ 删除旧头像文件失败:', unlinkError.message);
                }
            }
            
            res.json({
                success: true,
                message: '头像已重置为默认头像',
                data: {
                    avatar_url: defaultAvatarUrl
                }
            });
            
        } finally {
            connection.release();
            console.log('🔓 释放数据库连接，连接ID:', connection.threadId);
        }
        
        console.log(`🟢 [${new Date().toLocaleString()}] DELETE /api/profile/avatar - 200`);
        
    } catch (error) {
        console.error('❌ 删除头像失败:', error);
        res.status(500).json({
            success: false,
            message: '删除头像失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
        
        console.log(`🔴 [${new Date().toLocaleString()}] DELETE /api/profile/avatar - 500`);
    }
});

module.exports = router;
