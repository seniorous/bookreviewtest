/**
 * 书籍管理API路由（简化版）
 * 提供基础的书籍增删改查功能
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/mysql');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');

/**
 * 创建新书籍
 * POST /api/books
 */
router.post('/', authenticateToken, validate.books.create, async (req, res) => {
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
 * 更新书籍信息
 * PUT /api/books/:id
 */
router.put('/:id', authenticateToken, validate.books.update, async (req, res) => {
    try {
        const bookId = req.params.id;
        const { title, author, isbn, cover_url, description, publish_year, publisher } = req.body;
        
        // 检查书籍是否存在
        const existingBooks = await query('SELECT id FROM books WHERE id = ?', [bookId]);
        if (existingBooks.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书籍不存在'
            });
        }
        
        // 构建更新字段
        const updates = [];
        const values = [];
        
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (author !== undefined) { updates.push('author = ?'); values.push(author); }
        if (isbn !== undefined) { updates.push('isbn = ?'); values.push(isbn || null); }
        if (cover_url !== undefined) { updates.push('cover_url = ?'); values.push(cover_url || null); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description || null); }
        if (publish_year !== undefined) { updates.push('publish_year = ?'); values.push(publish_year || null); }
        if (publisher !== undefined) { updates.push('publisher = ?'); values.push(publisher || null); }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: '没有要更新的字段'
            });
        }
        
        values.push(bookId);
        await query(`UPDATE books SET ${updates.join(', ')} WHERE id = ?`, values);
        
        // 获取更新后的书籍
        const updatedBook = await query('SELECT * FROM books WHERE id = ?', [bookId]);
        
        res.json({
            success: true,
            message: '书籍更新成功',
            data: { book: updatedBook[0] }
        });
        
    } catch (error) {
        console.error('❌ 更新书籍失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 删除书籍
 * DELETE /api/books/:id
 */
router.delete('/:id', authenticateToken, requireAdmin, validate.books.delete, async (req, res) => {
    try {
        const bookId = req.params.id;
        
        // 检查书籍是否存在
        const existingBooks = await query('SELECT id, title FROM books WHERE id = ?', [bookId]);
        if (existingBooks.length === 0) {
            return res.status(404).json({
                success: false,
                message: '书籍不存在'
            });
        }
        
        // 检查是否有关联的书评
        const reviews = await query('SELECT COUNT(*) as count FROM reviews WHERE book_id = ?', [bookId]);
        const reviewCount = reviews[0].count;
        
        // 删除书籍（外键级联会自动删除关联数据）
        await query('DELETE FROM books WHERE id = ?', [bookId]);
        
        res.json({
            success: true,
            message: `书籍删除成功${reviewCount > 0 ? `，同时删除了${reviewCount}条相关书评` : ''}`,
            data: {
                deleted_book: existingBooks[0],
                deleted_reviews: reviewCount
            }
        });
        
    } catch (error) {
        console.error('❌ 删除书籍失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 智能搜索书籍
 * GET /api/books/search/intelligent
 */
router.get('/search/intelligent', validate.books.search, async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // 使用全文索引搜索（优先）+ LIKE 模糊搜索（兜底）
        const searchResults = await query(
            `SELECT id, title, author, cover_url, description, publish_year, publisher, 
                    total_reviews, average_rating,
                    MATCH(title, author, description) AGAINST (? IN NATURAL LANGUAGE MODE) as relevance
             FROM books
             WHERE MATCH(title, author, description) AGAINST (? IN NATURAL LANGUAGE MODE)
                OR title LIKE ? 
                OR author LIKE ?
             ORDER BY relevance DESC, total_reviews DESC, id DESC
             LIMIT ? OFFSET ?`,
            [q, q, `%${q}%`, `%${q}%`, parseInt(limit), parseInt(offset)]
        );
        
        // 统计总数
        const countResult = await query(
            `SELECT COUNT(*) as total
             FROM books
             WHERE MATCH(title, author, description) AGAINST (? IN NATURAL LANGUAGE MODE)
                OR title LIKE ? 
                OR author LIKE ?`,
            [q, `%${q}%`, `%${q}%`]
        );
        
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                books: searchResults,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    total_pages: Math.ceil(total / limit)
                },
                query: q
            }
        });
        
    } catch (error) {
        console.error('❌ 搜索书籍失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;