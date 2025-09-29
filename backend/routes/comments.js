/**
 * 书评评论系统API路由
 * 支持评论的增删改查、嵌套回复和审核管理
 * 
 * 功能列表：
 * - POST /api/comments/reviews/:reviewId - 发表评论
 * - GET /api/comments/reviews/:reviewId - 获取书评的评论列表
 * - GET /api/comments/:id - 获取单个评论详情
 * - PUT /api/comments/:id - 更新评论内容
 * - DELETE /api/comments/:id - 删除评论
 * - GET /api/comments/user/:userId - 获取用户评论历史
 * - GET /api/comments/my - 获取当前用户评论历史
 * - POST /api/comments/:id/reply - 回复评论
 * - PUT /api/comments/:id/status - 审核评论状态（管理员）
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/mysql');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * 发表评论
 * POST /api/comments/reviews/:reviewId
 * 需要登录
 */
router.post('/reviews/:reviewId', authenticateToken, async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const userId = req.user.userId;
        const { content } = req.body;
        
        // 验证输入
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能为空'
            });
        }
        
        if (content.length > 1000) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能超过1000字符'
            });
        }
        
        // 检查书评是否存在
        const reviews = await query(
            'SELECT id, user_id, status FROM reviews WHERE id = ?',
            [reviewId]
        );
        
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在'
            });
        }
        
        const review = reviews[0];
        if (review.status !== 'approved') {
            return res.status(403).json({
                success: false,
                message: '只能评论已通过审核的书评'
            });
        }
        
        // 创建评论
        const result = await query(
            'INSERT INTO review_comments (review_id, user_id, content) VALUES (?, ?, ?)',
            [reviewId, userId, content.trim()]
        );
        
        // 获取创建的评论详情
        const newComment = await query(
            `SELECT rc.*, u.username, u.avatar_url
             FROM review_comments rc
             JOIN users u ON rc.user_id = u.id
             WHERE rc.id = ?`,
            [result.insertId]
        );
        
        res.status(201).json({
            success: true,
            message: '评论发表成功',
            data: {
                comment: {
                    ...newComment[0],
                    replies: []
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 发表评论失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取评论统计信息
 * GET /api/comments/stats
 * 公开接口
 */
router.get('/stats', async (req, res) => {
    try {
        // 获取总评论数
        const totalComments = await query(
            'SELECT COUNT(*) as total FROM review_comments WHERE status = "approved"'
        );
        
        // 获取今日评论数
        const todayComments = await query(
            'SELECT COUNT(*) as today FROM review_comments WHERE status = "approved" AND DATE(created_at) = CURDATE()'
        );
        
        // 获取最活跃评论者（前10）
        const topCommenters = await query(
            `SELECT u.id, u.username, COUNT(rc.id) as comments_count
             FROM users u
             JOIN review_comments rc ON u.id = rc.user_id
             WHERE rc.status = 'approved'
             GROUP BY u.id
             ORDER BY comments_count DESC
             LIMIT 10`
        );
        
        // 获取最多评论的书评（前10）
        const mostCommentedReviews = await query(
            `SELECT r.id, r.title, r.comments_count,
                    b.title as book_title, b.author as book_author,
                    u.username as review_author
             FROM reviews r
             JOIN books b ON r.book_id = b.id
             JOIN users u ON r.user_id = u.id
             WHERE r.status = 'approved' AND r.comments_count > 0
             ORDER BY r.comments_count DESC
             LIMIT 10`
        );
        
        res.json({
            success: true,
            data: {
                total_comments: totalComments[0].total,
                today_comments: todayComments[0].today,
                top_commenters: topCommenters,
                most_commented_reviews: mostCommentedReviews
            }
        });
        
    } catch (error) {
        console.error('❌ 获取评论统计失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取书评的评论列表
 * GET /api/comments/reviews/:reviewId
 * 公开接口，支持分页和排序
 */
router.get('/reviews/:reviewId', async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const { page = 1, limit = 20, sort = 'newest' } = req.query;
        const offset = (page - 1) * limit;
        
        // 检查书评是否存在
        const reviews = await query('SELECT id FROM reviews WHERE id = ?', [reviewId]);
        if (reviews.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书评不存在'
            });
        }
        
        // 确定排序方式
        let orderBy = 'rc.created_at DESC'; // newest
        if (sort === 'oldest') {
            orderBy = 'rc.created_at ASC';
        }
        
        // 获取顶级评论（parent_id为NULL的评论）
        const topLevelComments = await query(
            `SELECT rc.*, u.username, u.avatar_url
             FROM review_comments rc
             JOIN users u ON rc.user_id = u.id
             WHERE rc.review_id = ? AND rc.parent_id IS NULL AND rc.status = 'approved'
             ORDER BY ${orderBy}
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            [reviewId]
        );
        
        // 为每个顶级评论获取回复
        const commentsWithReplies = await Promise.all(
            topLevelComments.map(async (comment) => {
                const replies = await query(
                    `SELECT rc.*, u.username, u.avatar_url
                     FROM review_comments rc
                     JOIN users u ON rc.user_id = u.id
                     WHERE rc.parent_id = ? AND rc.status = 'approved'
                     ORDER BY rc.created_at ASC`,
                    [comment.id]
                );
                
                return {
                    ...comment,
                    replies: replies
                };
            })
        );
        
        // 获取总评论数
        const countResult = await query(
            'SELECT COUNT(*) as total FROM review_comments WHERE review_id = ? AND parent_id IS NULL AND status = "approved"',
            [reviewId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                comments: commentsWithReplies,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取评论列表失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取单个评论详情
 * GET /api/comments/:id
 * 公开接口
 */
router.get('/:id', async (req, res) => {
    try {
        const commentId = req.params.id;
        
        const comments = await query(
            `SELECT rc.*, u.username, u.avatar_url,
                    r.title as review_title, b.title as book_title
             FROM review_comments rc
             JOIN users u ON rc.user_id = u.id
             JOIN reviews r ON rc.review_id = r.id
             JOIN books b ON r.book_id = b.id
             WHERE rc.id = ?`,
            [commentId]
        );
        
        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }
        
        const comment = comments[0];
        
        // 获取回复
        const replies = await query(
            `SELECT rc.*, u.username, u.avatar_url
             FROM review_comments rc
             JOIN users u ON rc.user_id = u.id
             WHERE rc.parent_id = ? AND rc.status = 'approved'
             ORDER BY rc.created_at ASC`,
            [commentId]
        );
        
        res.json({
            success: true,
            data: {
                comment: {
                    ...comment,
                    replies: replies
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取评论详情失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 更新评论内容
 * PUT /api/comments/:id
 * 需要登录，只能更新自己的评论
 */
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.userId;
        const { content } = req.body;
        
        // 验证输入
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能为空'
            });
        }
        
        if (content.length > 1000) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能超过1000字符'
            });
        }
        
        // 检查评论是否存在且属于当前用户
        const comments = await query(
            'SELECT id, user_id, created_at FROM review_comments WHERE id = ?',
            [commentId]
        );
        
        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }
        
        const comment = comments[0];
        if (comment.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: '只能修改自己的评论'
            });
        }
        
        // 检查是否超过编辑时限（24小时）
        const createdAt = new Date(comment.created_at);
        const now = new Date();
        const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
        
        if (hoursDiff > 24) {
            return res.status(403).json({
                success: false,
                message: '评论发表超过24小时后不能修改'
            });
        }
        
        // 更新评论
        await query(
            'UPDATE review_comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [content.trim(), commentId]
        );
        
        // 获取更新后的评论
        const updatedComment = await query(
            `SELECT rc.*, u.username, u.avatar_url
             FROM review_comments rc
             JOIN users u ON rc.user_id = u.id
             WHERE rc.id = ?`,
            [commentId]
        );
        
        res.json({
            success: true,
            message: '评论更新成功',
            data: {
                comment: updatedComment[0]
            }
        });
        
    } catch (error) {
        console.error('❌ 更新评论失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 删除评论
 * DELETE /api/comments/:id
 * 需要登录，只能删除自己的评论或管理员可删除任何评论
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.userId;
        const userRole = req.user.role;
        
        // 检查评论是否存在
        const comments = await query(
            'SELECT id, user_id FROM review_comments WHERE id = ?',
            [commentId]
        );
        
        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }
        
        const comment = comments[0];
        
        // 权限检查：只能删除自己的评论，或管理员可删除任何评论
        if (comment.user_id !== userId && userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '只能删除自己的评论'
            });
        }
        
        // 检查是否有回复
        const replies = await query(
            'SELECT COUNT(*) as count FROM review_comments WHERE parent_id = ?',
            [commentId]
        );
        
        if (replies[0].count > 0) {
            return res.status(409).json({
                success: false,
                message: '该评论有回复，无法删除',
                data: {
                    replies_count: replies[0].count
                }
            });
        }
        
        // 删除评论
        await query('DELETE FROM review_comments WHERE id = ?', [commentId]);
        
        res.json({
            success: true,
            message: '评论删除成功'
        });
        
    } catch (error) {
        console.error('❌ 删除评论失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取用户评论历史
 * GET /api/comments/user/:userId
 * 公开接口
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
        
        // 获取用户评论历史
        const comments = await query(
            `SELECT rc.id, rc.content, rc.created_at, rc.updated_at,
                    r.id as review_id, r.title as review_title,
                    b.title as book_title, b.author as book_author
             FROM review_comments rc
             JOIN reviews r ON rc.review_id = r.id
             JOIN books b ON r.book_id = b.id
             WHERE rc.user_id = ? AND rc.status = 'approved'
             ORDER BY rc.created_at DESC
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            [userId]
        );
        
        // 获取总数
        const countResult = await query(
            'SELECT COUNT(*) as total FROM review_comments WHERE user_id = ? AND status = "approved"',
            [userId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                user: users[0],
                comments: comments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取用户评论历史失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取当前用户评论历史
 * GET /api/comments/my
 * 需要登录
 */
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20, status = 'all' } = req.query;
        const offset = (page - 1) * limit;
        
        // 构建状态过滤条件
        let statusCondition = '';
        let queryParams = [userId];
        
        if (status !== 'all') {
            statusCondition = 'AND rc.status = ?';
            queryParams.push(status);
        }
        
        // 获取当前用户评论历史
        const comments = await query(
            `SELECT rc.id, rc.content, rc.status, rc.created_at, rc.updated_at,
                    r.id as review_id, r.title as review_title,
                    b.title as book_title, b.author as book_author
             FROM review_comments rc
             JOIN reviews r ON rc.review_id = r.id
             JOIN books b ON r.book_id = b.id
             WHERE rc.user_id = ? ${statusCondition}
             ORDER BY rc.created_at DESC
             LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            queryParams
        );
        
        // 获取总数
        const countParams = [...queryParams];
        const countResult = await query(
            `SELECT COUNT(*) as total FROM review_comments rc WHERE rc.user_id = ? ${statusCondition}`,
            countParams
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                comments: comments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取我的评论历史失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 回复评论
 * POST /api/comments/:id/reply
 * 需要登录
 */
router.post('/:id/reply', authenticateToken, async (req, res) => {
    try {
        const parentId = req.params.id;
        const userId = req.user.userId;
        const { content } = req.body;
        
        // 验证输入
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '回复内容不能为空'
            });
        }
        
        if (content.length > 1000) {
            return res.status(400).json({
                success: false,
                message: '回复内容不能超过1000字符'
            });
        }
        
        // 检查父评论是否存在
        const parentComments = await query(
            `SELECT rc.id, rc.review_id, r.status as review_status
             FROM review_comments rc
             JOIN reviews r ON rc.review_id = r.id
             WHERE rc.id = ? AND rc.status = 'approved'`,
            [parentId]
        );
        
        if (parentComments.length === 0) {
            return res.status(404).json({
                success: false,
                message: '父评论不存在或未通过审核'
            });
        }
        
        const parentComment = parentComments[0];
        if (parentComment.review_status !== 'approved') {
            return res.status(403).json({
                success: false,
                message: '只能回复已通过审核书评的评论'
            });
        }
        
        // 创建回复
        const result = await query(
            'INSERT INTO review_comments (review_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)',
            [parentComment.review_id, userId, parentId, content.trim()]
        );
        
        // 获取创建的回复详情
        const newReply = await query(
            `SELECT rc.*, u.username, u.avatar_url
             FROM review_comments rc
             JOIN users u ON rc.user_id = u.id
             WHERE rc.id = ?`,
            [result.insertId]
        );
        
        res.status(201).json({
            success: true,
            message: '回复发表成功',
            data: {
                reply: newReply[0]
            }
        });
        
    } catch (error) {
        console.error('❌ 回复评论失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 审核评论状态（管理员功能）
 * PUT /api/comments/:id/status
 * 需要管理员权限
 */
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const commentId = req.params.id;
        const { status, admin_note } = req.body;
        
        // 验证状态值
        const validStatuses = ['approved', 'pending', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的状态值',
                valid_statuses: validStatuses
            });
        }
        
        // 检查评论是否存在
        const comments = await query(
            'SELECT id, status FROM review_comments WHERE id = ?',
            [commentId]
        );
        
        if (comments.length === 0) {
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }
        
        // 更新评论状态
        await query(
            'UPDATE review_comments SET status = ? WHERE id = ?',
            [status, commentId]
        );
        
        // 如果有管理员备注，记录到系统日志（这里简化处理）
        if (admin_note) {
            console.log(`📝 管理员审核评论 ${commentId}: ${status} - ${admin_note}`);
        }
        
        res.json({
            success: true,
            message: '评论状态更新成功',
            data: {
                comment_id: parseInt(commentId),
                status: status,
                admin_note: admin_note || null
            }
        });
        
    } catch (error) {
        console.error('❌ 审核评论失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
