/**
 * 书评收藏系统API路由
 * 提供书评收藏和取消收藏功能
 * 
 * 功能列表：
 * - POST /api/favorites/reviews/:reviewId - 收藏书评
 * - DELETE /api/favorites/reviews/:reviewId - 取消收藏书评
 * - GET /api/favorites/reviews/:reviewId - 查看书评收藏状态
 * - GET /api/favorites/user/:userId - 获取用户收藏历史
 * - GET /api/favorites/my - 获取当前用户收藏历史
 * - POST /api/favorites/reviews/batch - 批量查询收藏状态
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/mysql');
const { authenticateToken } = require('../middleware/auth');

/**
 * 收藏书评
 * POST /api/favorites/reviews/:reviewId
 * 需要登录
 */
router.post('/reviews/:reviewId', authenticateToken, async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const userId = req.user.userId;
        
        // 检查书评是否存在
        const reviews = await query(
            'SELECT id, user_id FROM reviews WHERE id = ? AND status = "approved"',
            [reviewId]
        );
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在或未通过审核'
            });
        }
        
        // 检查是否已经收藏过
        const existingFavorites = await query(
            'SELECT id FROM user_favorites WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );
        
        if (existingFavorites.length > 0) {
            return res.status(409).json({
                success: false,
                message: '您已经收藏过这条书评了'
            });
        }
        
        // 可以收藏自己的书评（与点赞不同）
        
        // 添加收藏记录
        await query(
            'INSERT INTO user_favorites (user_id, review_id) VALUES (?, ?)',
            [userId, reviewId]
        );
        
        // 获取书评基本信息
        const reviewInfo = await query(
            'SELECT title, content FROM reviews WHERE id = ?',
            [reviewId]
        );
        
        res.status(201).json({
            success: true,
            message: '收藏成功',
            data: {
                review_id: parseInt(reviewId),
                title: reviewInfo[0].title,
                is_favorited: true
            }
        });
        
    } catch (error) {
        console.error('❌ 收藏书评失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 取消收藏书评
 * DELETE /api/favorites/reviews/:reviewId
 * 需要登录
 */
router.delete('/reviews/:reviewId', authenticateToken, async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const userId = req.user.userId;
        
        // 检查是否已经收藏过
        const existingFavorites = await query(
            'SELECT id FROM user_favorites WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );
        
        if (existingFavorites.length === 0) {
            return res.status(404).json({
                success: false,
                message: '您还没有收藏过这条书评'
            });
        }
        
        // 删除收藏记录
        await query(
            'DELETE FROM user_favorites WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );
        
        res.json({
            success: true,
            message: '取消收藏成功',
            data: {
                review_id: parseInt(reviewId),
                is_favorited: false
            }
        });
        
    } catch (error) {
        console.error('❌ 取消收藏失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 查看书评收藏状态
 * GET /api/favorites/reviews/:reviewId
 * 可选登录（登录后显示当前用户是否收藏）
 */
router.get('/reviews/:reviewId', async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        
        // 获取书评基本信息
        const reviews = await query(
            'SELECT id, title, user_id FROM reviews WHERE id = ?',
            [reviewId]
        );
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在'
            });
        }
        
        const review = reviews[0];
        let isFavorited = false;
        
        // 如果用户已登录，检查是否收藏过
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                const userFavorites = await query(
                    'SELECT id FROM user_favorites WHERE user_id = ? AND review_id = ?',
                    [decoded.userId, reviewId]
                );
                
                isFavorited = userFavorites.length > 0;
            } catch (error) {
                // Token无效，忽略错误，继续返回数据
            }
        }
        
        // 获取总收藏数
        const favoriteCount = await query(
            'SELECT COUNT(*) as count FROM user_favorites WHERE review_id = ?',
            [reviewId]
        );
        
        res.json({
            success: true,
            data: {
                review_id: review.id,
                title: review.title,
                favorites_count: favoriteCount[0].count,
                is_favorited: isFavorited
            }
        });
        
    } catch (error) {
        console.error('❌ 获取收藏状态失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取指定用户的收藏历史
 * GET /api/favorites/user/:userId
 * 公开接口，任何人都可以查看
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // 检查用户是否存在
        const users = await query('SELECT id, username FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }
        
        // 获取用户收藏历史
        const favorites = await query(
            `SELECT uf.created_at, r.id as review_id, r.title, r.content, r.rating,
                    b.title as book_title, b.author as book_author,
                    u.username as review_author
             FROM user_favorites uf
             JOIN reviews r ON uf.review_id = r.id
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE uf.user_id = ? AND r.status = 'approved'
             ORDER BY uf.created_at DESC
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            [userId]
        );
        
        // 获取总数
        const countResult = await query(
            'SELECT COUNT(*) as total FROM user_favorites uf JOIN reviews r ON uf.review_id = r.id WHERE uf.user_id = ? AND r.status = "approved"',
            [userId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                user: users[0],
                favorites: favorites,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取用户收藏历史失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取当前用户的收藏历史
 * GET /api/favorites/my
 * 需要登录
 */
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // 获取当前用户收藏历史
        const favorites = await query(
            `SELECT uf.created_at, r.id as review_id, r.title, r.content, r.rating,
                    b.title as book_title, b.author as book_author,
                    u.username as review_author
             FROM user_favorites uf
             JOIN reviews r ON uf.review_id = r.id
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE uf.user_id = ? AND r.status = 'approved'
             ORDER BY uf.created_at DESC
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            [userId]
        );
        
        // 获取总数
        const countResult = await query(
            'SELECT COUNT(*) as total FROM user_favorites uf JOIN reviews r ON uf.review_id = r.id WHERE uf.user_id = ? AND r.status = "approved"',
            [userId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                favorites: favorites,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取我的收藏历史失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 批量查询多个书评的收藏状态
 * POST /api/favorites/reviews/batch
 * 可选登录
 */
router.post('/reviews/batch', async (req, res) => {
    try {
        const { review_ids } = req.body;
        
        if (!Array.isArray(review_ids) || review_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: '请提供有效的书评ID列表'
            });
        }
        
        // 限制批量查询数量
        if (review_ids.length > 50) {
            return res.status(400).json({
                success: false,
                message: '一次最多只能查询50个书评'
            });
        }
        
        // 获取书评基本信息
        const placeholders = review_ids.map(() => '?').join(',');
        const reviews = await query(
            `SELECT id, title FROM reviews WHERE id IN (${placeholders})`,
            review_ids
        );
        
        // 获取每个书评的收藏数
        const favoriteCounts = await query(
            `SELECT review_id, COUNT(*) as count 
             FROM user_favorites 
             WHERE review_id IN (${placeholders})
             GROUP BY review_id`,
            review_ids
        );
        
        const favoriteCountMap = new Map();
        favoriteCounts.forEach(item => {
            favoriteCountMap.set(item.review_id, item.count);
        });
        
        let userFavorites = [];
        
        // 如果用户已登录，获取收藏状态
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                userFavorites = await query(
                    `SELECT review_id FROM user_favorites WHERE user_id = ? AND review_id IN (${placeholders})`,
                    [decoded.userId, ...review_ids]
                );
            } catch (error) {
                // Token无效，忽略错误
            }
        }
        
        const favoritedReviewIds = new Set(userFavorites.map(fav => fav.review_id));
        
        const result = reviews.map(review => ({
            review_id: review.id,
            title: review.title,
            favorites_count: favoriteCountMap.get(review.id) || 0,
            is_favorited: favoritedReviewIds.has(review.id)
        }));
        
        res.json({
            success: true,
            data: {
                reviews: result
            }
        });
        
    } catch (error) {
        console.error('❌ 批量查询收藏状态失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取收藏统计信息
 * GET /api/favorites/stats
 * 公开接口
 */
router.get('/stats', async (req, res) => {
    try {
        // 获取总收藏数
        const totalFavorites = await query('SELECT COUNT(*) as total FROM user_favorites');
        
        // 获取最受收藏的书评（前10）
        const topFavorited = await query(
            `SELECT r.id, r.title, COUNT(uf.id) as favorites_count,
                    b.title as book_title, b.author as book_author,
                    u.username as review_author
             FROM reviews r
             JOIN user_favorites uf ON r.id = uf.review_id
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE r.status = 'approved'
             GROUP BY r.id
             ORDER BY favorites_count DESC
             LIMIT 10`
        );
        
        // 获取活跃收藏用户（前10）
        const topCollectors = await query(
            `SELECT u.id, u.username, COUNT(uf.id) as favorites_count
             FROM users u
             JOIN user_favorites uf ON u.id = uf.user_id
             JOIN reviews r ON uf.review_id = r.id
             WHERE u.status = 'active' AND r.status = 'approved'
             GROUP BY u.id
             ORDER BY favorites_count DESC
             LIMIT 10`
        );
        
        res.json({
            success: true,
            data: {
                total_favorites: totalFavorites[0].total,
                top_favorited_reviews: topFavorited,
                top_collectors: topCollectors
            }
        });
        
    } catch (error) {
        console.error('❌ 获取收藏统计失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
