/**
 * 书籍管理API路由（简化版）
 * 提供基础的书籍增删改查功能
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/mysql');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * 创建新书籍
 * POST /api/books
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { title, author, isbn, publisher, publishYear, description, coverUrl } = req.body;
        
        // 输入验证
        if (!title || !author) {
            return res.status(400).json({
                success: false,
                message: '书名和作者为必填项'
            });
        }
        
        // 检查是否已存在相同的书籍
        const existingBooks = await query(
            'SELECT id, title, author FROM books WHERE title = ? AND author = ?',
            [title, author]
        );
        
        if (existingBooks.length > 0) {
            return res.status(409).json({
                success: false,
                message: '该书籍已存在',
                data: { existing_book: existingBooks[0] }
            });
        }
        
        // 创建新书籍
        const result = await query(
            `INSERT INTO books (title, author, isbn, publisher, publish_year, description, cover_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, author, isbn || null, publisher || null, publishYear || null, 
             description || null, coverUrl || null]
        );
        
        // 获取创建的书籍详情
        const newBook = await query(`SELECT * FROM books WHERE id = ?`, [result.insertId]);
        
        res.status(201).json({
            success: true,
            message: '书籍创建成功',
            data: { book: newBook[0] }
        });
        
    } catch (error) {
        console.error('❌ 创建书籍失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取书籍列表
 * GET /api/books
 */
router.get('/', async (req, res) => {
    try {
        let { page = 1, limit = 20 } = req.query;
        
        // 参数验证和范围限制
        page = Math.max(1, parseInt(page) || 1);
        limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset = (page - 1) * limit;
        
        // 查询书籍列表 - 使用参数化查询
        const books = await query(`SELECT * FROM books ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
        
        // 查询总数
        const countResult = await query(`SELECT COUNT(*) as total FROM books`);
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                books: books.map(book => ({
                    ...book,
                    average_rating: parseFloat(book.average_rating || 0).toFixed(1),
                    review_count: 0
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取书籍列表失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 获取单个书籍详情
 * GET /api/books/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const bookId = req.params.id;
        
        const books = await query(`SELECT * FROM books WHERE id = ?`, [bookId]);
        
        if (books.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书籍不存在'
            });
        }
        
        const book = books[0];
        
        res.json({
            success: true,
            data: {
                book: {
                    ...book,
                    average_rating: parseFloat(book.average_rating || 0).toFixed(1),
                    review_count: 0,
                    tags: []
                }
            }
        });
        
    } catch (error) {
        console.error('❌ 获取书籍详情失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 更新书籍信息 - 开发中
 * PUT /api/books/:id
 */
router.put('/:id', authenticateToken, async (req, res) => {
    res.status(501).json({
        success: false,
        message: '功能开发中',
        code: 'FEATURE_IN_DEVELOPMENT'
    });
});

/**
 * 删除书籍 - 开发中
 * DELETE /api/books/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    res.status(501).json({
        success: false,
        message: '功能开发中',
        code: 'FEATURE_IN_DEVELOPMENT'
    });
});

/**
 * 智能搜索 - 开发中
 * GET /api/books/search/intelligent
 */
router.get('/search/intelligent', async (req, res) => {
    res.status(501).json({
        success: false,
        message: '功能开发中',
        code: 'FEATURE_IN_DEVELOPMENT'
    });
});

module.exports = router;