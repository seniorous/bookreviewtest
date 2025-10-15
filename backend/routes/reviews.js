/**
 * 书评管理API路由
 * 提供书评的增删改查功能
 * 
 * 功能列表：
 * - POST /api/reviews - 创建书评
 * - GET /api/reviews - 获取书评列表（支持筛选、分页）
 * - GET /api/reviews/:id - 获取单个书评详情
 * - PUT /api/reviews/:id - 更新书评
 * - DELETE /api/reviews/:id - 删除书评
 * - GET /api/books/:bookId/reviews - 获取特定书籍的书评
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/mysql');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');

/**
 * 创建新书评
 * POST /api/reviews
 * 需要登录
 */
router.post('/', authenticateToken, validate.reviews.create, async (req, res) => {
    try {
        const { book_id, title, content, rating } = req.body;
        const userId = req.user.userId;
        
        // 输入验证
        if (!book_id || !title || !content || !rating) {
            return res.status(400).json({
                success: false,
                message: '书籍ID、标题、内容和评分为必填项'
            });
        }
        
        // 验证评分范围
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: '评分必须在1-5之间'
            });
        }
        
        // 检查书籍是否存在
        const books = await query('SELECT id FROM books WHERE id = ?', [book_id]);
        if (books.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定的书籍不存在'
            });
        }
        
        // 检查用户是否已经评论过这本书
        const existingReviews = await query(
            'SELECT id FROM reviews WHERE user_id = ? AND book_id = ?',
            [userId, book_id]
        );
        
        if (existingReviews.length > 0) {
            return res.status(409).json({
                success: false,
                message: '您已经评论过这本书了，每本书只能评论一次'
            });
        }
        
        // 创建书评
        const result = await query(
            `INSERT INTO reviews (user_id, book_id, title, content, rating, status) 
             VALUES (?, ?, ?, ?, ?, 'approved')`,
            [userId, book_id, title, content, rating]
        );
        
        // 获取创建的书评详情
        const newReview = await query(
            `SELECT r.*, b.title as book_title, b.author as book_author, u.username 
             FROM reviews r
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE r.id = ?`,
            [result.insertId]
        );
        
        res.status(201).json({
            success: true,
            message: '书评创建成功',
            data: { review: newReview[0] }
        });
        
    } catch (error) {
        console.error('❌ 创建书评失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取书评列表
 * GET /api/reviews
 * 支持查询参数：
 * - page: 页码 (默认1)
 * - limit: 每页数量 (默认20)
 * - book_id: 筛选特定书籍
 * - user_id: 筛选特定用户
 * - status: 筛选状态
 * - sort: 排序方式 (newest, oldest, rating_high, rating_low)
 */
router.get('/', async (req, res) => {
    try {
        let { 
            page = 1, 
            limit = 20, 
            book_id, 
            user_id, 
            status = 'approved',
            sort = 'newest' 
        } = req.query;
        
        // 参数验证和范围限制
        page = Math.max(1, parseInt(page) || 1);
        limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset = (page - 1) * limit;
        
        // 构建WHERE条件
        let whereConditions = ['r.status = ?'];
        let queryParams = [status];
        
        if (book_id) {
            whereConditions.push('r.book_id = ?');
            queryParams.push(book_id);
        }
        
        if (user_id) {
            whereConditions.push('r.user_id = ?');
            queryParams.push(user_id);
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // 排序条件 - 使用白名单映射防止SQL注入
        const sortOptions = {
            'newest': 'ORDER BY r.created_at DESC',
            'oldest': 'ORDER BY r.created_at ASC',
            'rating_high': 'ORDER BY r.rating DESC, r.created_at DESC',
            'rating_low': 'ORDER BY r.rating ASC, r.created_at DESC',
            'hot': 'ORDER BY (r.likes_count * 3 + r.comments_count * 2 + r.views) DESC, r.created_at DESC',
            'most_liked': 'ORDER BY r.likes_count DESC, r.created_at DESC',
            'most_viewed': 'ORDER BY r.views DESC, r.created_at DESC'
        };
        const orderClause = sortOptions[sort] || sortOptions['hot'];
        
        // 查询书评列表 - 使用参数化查询
        const reviews = await query(
            `SELECT r.*, b.title as book_title, b.author as book_author, u.username 
             FROM reviews r
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             ${whereClause}
             ${orderClause}
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            queryParams
        );
        
        // 查询总数
        const countResult = await query(
            `SELECT COUNT(*) as total FROM reviews r ${whereClause}`,
            queryParams
        );
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                reviews: reviews,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取书评列表失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取单个书评详情
 * GET /api/reviews/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const reviewId = req.params.id;
        const userId = req.user ? req.user.userId : null;
        
        // 查询书评详情（包含用户交互状态）
        const reviewQuery = `
            SELECT 
                r.*, 
                b.title as book_title, 
                b.author as book_author, 
                b.cover_url as book_cover,
                u.username, 
                u.avatar_url,
                ${userId ? `
                    EXISTS(SELECT 1 FROM review_likes WHERE user_id = ? AND review_id = r.id) as is_liked,
                    EXISTS(SELECT 1 FROM user_favorites WHERE user_id = ? AND review_id = r.id) as is_favorited
                ` : 'false as is_liked, false as is_favorited'}
            FROM reviews r
            JOIN books b ON r.book_id = b.id
            JOIN users u ON r.user_id = u.id
            WHERE r.id = ? AND r.status = 'approved'
        `;
        
        const params = userId ? [userId, userId, reviewId] : [reviewId];
        const reviews = await query(reviewQuery, params);
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在或未通过审核',
                code: 'REVIEW_NOT_FOUND'
            });
        }
        
        const reviewData = reviews[0];
        
        // 构造返回数据
        const response = {
            review: {
                id: reviewData.id,
                title: reviewData.title,
                content: reviewData.content,
                rating: reviewData.rating,
                views: reviewData.views,
                likes_count: reviewData.likes_count,
                comments_count: reviewData.comments_count,
                created_at: reviewData.created_at,
                updated_at: reviewData.updated_at
            },
            book: {
                id: reviewData.book_id,
                title: reviewData.book_title,
                author: reviewData.book_author,
                cover_url: reviewData.book_cover
            },
            user: {
                id: reviewData.user_id,
                username: reviewData.username,
                avatar_url: reviewData.avatar_url
            }
        };
        
        // 如果用户已登录，添加交互状态
        if (userId) {
            response.review.user_interaction = {
                is_liked: Boolean(reviewData.is_liked),
                is_favorited: Boolean(reviewData.is_favorited)
            };
        }
        
        res.json({
            success: true,
            message: '获取书评详情成功',
            data: response
        });
        
    } catch (error) {
        console.error('❌ 获取书评详情失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * 记录书评浏览量
 * POST /api/reviews/:id/view
 */
router.post('/:id/view', async (req, res) => {
    try {
        const reviewId = req.params.id;
        const userId = req.user ? req.user.userId : null;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        // 检查书评是否存在
        const reviews = await query('SELECT id FROM reviews WHERE id = ? AND status = "approved"', [reviewId]);
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在',
                code: 'REVIEW_NOT_FOUND'
            });
        }
        
        // 简单的防重复浏览策略：30分钟内同一用户或IP只计算一次
        const timeWindow = 30 * 60 * 1000; // 30分钟
        const windowStart = new Date(Date.now() - timeWindow);
        
        let shouldCount = true;
        
        if (userId) {
            // 检查登录用户是否在时间窗口内已浏览
            const recentViews = await query(
                `SELECT id FROM system_logs 
                 WHERE user_id = ? AND action = 'view_review' AND target_id = ? AND created_at > ?`,
                [userId, reviewId, windowStart]
            );
            shouldCount = recentViews.length === 0;
        } else {
            // 检查相同IP是否在时间窗口内已浏览（简化版）
            const recentViews = await query(
                `SELECT id FROM system_logs 
                 WHERE ip_address = ? AND action = 'view_review' AND target_id = ? AND created_at > ?`,
                [ipAddress, reviewId, windowStart]
            );
            shouldCount = recentViews.length === 0;
        }
        
        let currentViews = 0;
        
        if (shouldCount) {
            // 增加浏览次数
            await query('UPDATE reviews SET views = views + 1 WHERE id = ?', [reviewId]);
            
            // 记录浏览日志
            await query(
                `INSERT INTO system_logs (user_id, action, target_type, target_id, ip_address, user_agent) 
                 VALUES (?, 'view_review', 'review', ?, ?, ?)`,
                [userId, reviewId, ipAddress, userAgent]
            );
            
            // 获取更新后的浏览量
            const updatedReviews = await query('SELECT views FROM reviews WHERE id = ?', [reviewId]);
            currentViews = updatedReviews[0].views;
        } else {
            // 获取当前浏览量
            const currentReviews = await query('SELECT views FROM reviews WHERE id = ?', [reviewId]);
            currentViews = currentReviews[0].views;
        }
        
        res.json({
            success: true,
            message: shouldCount ? '浏览量记录成功' : '浏览量已记录',
            data: {
                views: currentViews,
                counted: shouldCount
            }
        });
        
    } catch (error) {
        console.error('❌ 记录浏览量失败:', error);
        res.status(500).json({
            success: false,
            message: '记录浏览量失败',
            code: 'VIEW_RECORD_ERROR'
        });
    }
});

/**
 * 更新书评
 * PUT /api/reviews/:id
 * 只有书评作者或管理员可以修改
 */
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const reviewId = req.params.id;
        const userId = req.user.userId;
        const userRole = req.user.role;
        const { title, content, rating } = req.body;
        
        // 检查书评是否存在
        const reviews = await query('SELECT * FROM reviews WHERE id = ?', [reviewId]);
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在'
            });
        }
        
        const review = reviews[0];
        
        // 权限检查：只有作者或管理员可以修改
        if (review.user_id !== userId && userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '没有权限修改此书评'
            });
        }
        
        // 构建更新字段
        const updateFields = [];
        const updateValues = [];
        
        if (title !== undefined) {
            updateFields.push('title = ?');
            updateValues.push(title);
        }
        if (content !== undefined) {
            updateFields.push('content = ?');
            updateValues.push(content);
        }
        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                return res.status(400).json({
                    success: false,
                    message: '评分必须在1-5之间'
                });
            }
            updateFields.push('rating = ?');
            updateValues.push(rating);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: '没有要更新的字段'
            });
        }
        
        updateFields.push('updated_at = NOW()');
        updateValues.push(reviewId);
        
        // 更新书评
        await query(
            `UPDATE reviews SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );
        
        // 获取更新后的书评
        const updatedReview = await query(
            `SELECT r.*, b.title as book_title, b.author as book_author, u.username 
             FROM reviews r
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE r.id = ?`,
            [reviewId]
        );
        
        res.json({
            success: true,
            message: '书评更新成功',
            data: { review: updatedReview[0] }
        });
        
    } catch (error) {
        console.error('❌ 更新书评失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 删除书评
 * DELETE /api/reviews/:id
 * 只有书评作者或管理员可以删除
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const reviewId = req.params.id;
        const userId = req.user.userId;
        const userRole = req.user.role;
        
        // 检查书评是否存在
        const reviews = await query('SELECT * FROM reviews WHERE id = ?', [reviewId]);
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在'
            });
        }
        
        const review = reviews[0];
        
        // 权限检查：只有作者或管理员可以删除
        if (review.user_id !== userId && userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '没有权限删除此书评'
            });
        }
        
        // 软删除：更改状态为hidden
        await query('UPDATE reviews SET status = "hidden" WHERE id = ?', [reviewId]);
        
        res.json({
            success: true,
            message: '书评删除成功'
        });
        
    } catch (error) {
        console.error('❌ 删除书评失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取特定书籍的书评
 * GET /api/reviews/books/:bookId
 */
router.get('/books/:bookId', async (req, res) => {
    try {
        const { bookId } = req.params;
        const { page = 1, limit = 10, sort = 'newest' } = req.query;
        const offset = (page - 1) * limit;
        
        // 检查书籍是否存在
        const books = await query('SELECT id, title, author FROM books WHERE id = ?', [bookId]);
        if (books.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书籍不存在'
            });
        }
        
        // 排序条件
        let orderClause = 'ORDER BY r.created_at DESC';
        if (sort === 'rating_high') {
            orderClause = 'ORDER BY r.rating DESC, r.created_at DESC';
        } else if (sort === 'rating_low') {
            orderClause = 'ORDER BY r.rating ASC, r.created_at DESC';
        }
        
        // 查询书评
        const reviews = await query(
            `SELECT r.*, u.username 
             FROM reviews r
             JOIN users u ON r.user_id = u.id
             WHERE r.book_id = ? AND r.status = 'approved'
             ${orderClause}
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            [bookId]
        );
        
        // 查询总数和统计信息
        const [countResult, statsResult] = await Promise.all([
            query('SELECT COUNT(*) as total FROM reviews WHERE book_id = ? AND status = "approved"', [bookId]),
            query(`SELECT 
                     COUNT(*) as total_reviews,
                     AVG(rating) as average_rating,
                     COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                     COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                     COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                     COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                     COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
                   FROM reviews 
                   WHERE book_id = ? AND status = 'approved'`, [bookId])
        ]);
        
        const total = countResult[0].total;
        const stats = statsResult[0];
        
        res.json({
            success: true,
            data: {
                book: books[0],
                reviews: reviews,
                stats: {
                    total_reviews: parseInt(stats.total_reviews),
                    average_rating: parseFloat(stats.average_rating || 0).toFixed(1),
                    rating_distribution: {
                        5: parseInt(stats.five_star),
                        4: parseInt(stats.four_star),
                        3: parseInt(stats.three_star),
                        2: parseInt(stats.two_star),
                        1: parseInt(stats.one_star)
                    }
                },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取书籍书评失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
