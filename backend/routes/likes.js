/**
 * 书评点赞系统API路由
 * 提供书评点赞和取消点赞功能
 * 
 * 功能列表：
 * - POST /api/likes/reviews/:reviewId - 点赞书评
 * - DELETE /api/likes/reviews/:reviewId - 取消点赞书评
 * - GET /api/likes/reviews/:reviewId - 查看书评点赞状态
 * - GET /api/likes/user/:userId - 获取用户点赞历史
 * - GET /api/likes/my - 获取当前用户点赞历史
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/mysql');
const { authenticateToken } = require('../middleware/auth');

/**
 * 点赞书评
 * POST /api/likes/reviews/:reviewId
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
        
        // 检查是否已经点赞过
        const existingLikes = await query(
            'SELECT id FROM review_likes WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );
        
        if (existingLikes.length > 0) {
            return res.status(409).json({
                success: false,
                message: '您已经点赞过这条书评了'
            });
        }
        
        // 不能给自己的书评点赞
        if (reviews[0].user_id === userId) {
            return res.status(400).json({
                success: false,
                message: '不能给自己的书评点赞'
            });
        }
        
        // 添加点赞记录（触发器会自动更新计数）
        await query(
            'INSERT INTO review_likes (user_id, review_id) VALUES (?, ?)',
            [userId, reviewId]
        );
        
        // 获取更新后的点赞数
        const updatedReview = await query(
            'SELECT likes_count FROM reviews WHERE id = ?',
            [reviewId]
        );
        
        res.status(201).json({
            success: true,
            message: '点赞成功',
            data: {
                review_id: parseInt(reviewId),
                likes_count: updatedReview[0].likes_count,
                is_liked: true
            }
        });
        
    } catch (error) {
        console.error('❌ 点赞书评失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 取消点赞书评
 * DELETE /api/likes/reviews/:reviewId
 * 需要登录
 */
router.delete('/reviews/:reviewId', authenticateToken, async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const userId = req.user.userId;
        
        // 检查是否已经点赞过
        const existingLikes = await query(
            'SELECT id FROM review_likes WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );
        
        if (existingLikes.length === 0) {
            return res.status(404).json({
                success: false,
                message: '您还没有点赞过这条书评'
            });
        }
        
        // 删除点赞记录（触发器会自动更新计数）
        await query(
            'DELETE FROM review_likes WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );
        
        // 获取更新后的点赞数
        const updatedReview = await query(
            'SELECT likes_count FROM reviews WHERE id = ?',
            [reviewId]
        );
        
        res.json({
            success: true,
            message: '取消点赞成功',
            data: {
                review_id: parseInt(reviewId),
                likes_count: updatedReview[0] ? updatedReview[0].likes_count : 0,
                is_liked: false
            }
        });
        
    } catch (error) {
        console.error('❌ 取消点赞失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 查看书评点赞状态
 * GET /api/likes/reviews/:reviewId
 * 可选登录（登录后显示当前用户是否点赞）
 */
router.get('/reviews/:reviewId', async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        
        // 获取书评基本信息和点赞数
        const reviews = await query(
            'SELECT id, title, likes_count, user_id FROM reviews WHERE id = ?',
            [reviewId]
        );
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在'
            });
        }
        
        const review = reviews[0];
        let isLiked = false;
        
        // 如果用户已登录，检查是否点赞过
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                const userLikes = await query(
                    'SELECT id FROM review_likes WHERE user_id = ? AND review_id = ?',
                    [decoded.userId, reviewId]
                );
                
                isLiked = userLikes.length > 0;
            } catch (error) {
                // Token无效，忽略错误，继续返回数据
            }
        }
        
        res.json({
            success: true,
            data: {
                review_id: review.id,
                title: review.title,
                likes_count: review.likes_count,
                is_liked: isLiked
            }
        });
        
    } catch (error) {
        console.error('❌ 获取点赞状态失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取指定用户的点赞历史
 * GET /api/likes/user/:userId
 * 公开接口，任何人都可以查看
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        let { page = 1, limit = 20 } = req.query;
        
        // 参数验证和范围限制
        page = Math.max(1, parseInt(page) || 1);
        limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset = (page - 1) * limit;
        
        // 检查用户是否存在
        const users = await query('SELECT id, username FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }
        
        // 获取用户点赞历史 - 使用参数化查询
        const likes = await query(
            `SELECT rl.created_at, r.id as review_id, r.title, r.content, r.rating,
                    b.title as book_title, b.author as book_author,
                    u.username as review_author
             FROM review_likes rl
             JOIN reviews r ON rl.review_id = r.id
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE rl.user_id = ? AND r.status = 'approved'
             ORDER BY rl.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );
        
        // 获取总数
        const countResult = await query(
            'SELECT COUNT(*) as total FROM review_likes rl JOIN reviews r ON rl.review_id = r.id WHERE rl.user_id = ? AND r.status = "approved"',
            [userId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                user: users[0],
                likes: likes,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取用户点赞历史失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取当前用户的点赞历史
 * GET /api/likes/my
 * 需要登录
 */
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        let { page = 1, limit = 20 } = req.query;
        
        // 参数验证和范围限制
        page = Math.max(1, parseInt(page) || 1);
        limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset = (page - 1) * limit;
        
        // 获取当前用户点赞历史 - 使用参数化查询
        const likes = await query(
            `SELECT rl.created_at, r.id as review_id, r.title, r.content, r.rating,
                    b.title as book_title, b.author as book_author,
                    u.username as review_author
             FROM review_likes rl
             JOIN reviews r ON rl.review_id = r.id
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE rl.user_id = ? AND r.status = 'approved'
             ORDER BY rl.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );
        
        // 获取总数
        const countResult = await query(
            'SELECT COUNT(*) as total FROM review_likes rl JOIN reviews r ON rl.review_id = r.id WHERE rl.user_id = ? AND r.status = "approved"',
            [userId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                likes: likes,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取我的点赞历史失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 批量查询多个书评的点赞状态
 * POST /api/likes/reviews/batch
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
            `SELECT id, title, likes_count FROM reviews WHERE id IN (${placeholders})`,
            review_ids
        );
        
        let userLikes = [];
        
        // 如果用户已登录，获取点赞状态
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                userLikes = await query(
                    `SELECT review_id FROM review_likes WHERE user_id = ? AND review_id IN (${placeholders})`,
                    [decoded.userId, ...review_ids]
                );
            } catch (error) {
                // Token无效，忽略错误
            }
        }
        
        const likedReviewIds = new Set(userLikes.map(like => like.review_id));
        
        const result = reviews.map(review => ({
            review_id: review.id,
            title: review.title,
            likes_count: review.likes_count,
            is_liked: likedReviewIds.has(review.id)
        }));
        
        res.json({
            success: true,
            data: {
                reviews: result
            }
        });
        
    } catch (error) {
        console.error('❌ 批量查询点赞状态失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
