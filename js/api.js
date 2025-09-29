/**
 * API工具类 - 用于与后端MySQL API通信
 * 替代Firebase的前端API调用
 */

class BookReviewerAPI {
  constructor() {
    // API基础URL - 后端服务器地址
    this.baseURL = 'http://localhost:3001/api';
    
    // 从localStorage获取认证令牌
    this.token = localStorage.getItem('auth_token');
    
    console.log('📡 BookReviewerAPI 初始化完成');
    console.log(`🔗 API地址: ${this.baseURL}`);
  }

  /**
   * 获取请求头（包含认证信息）
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  /**
   * 通用API请求方法
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: this.getHeaders(),
      ...options
    };

    try {
      console.log(`📡 API请求: ${options.method || 'GET'} ${endpoint}`);
      
      const response = await fetch(url, config);
      const data = await response.json();
      
      // 检查响应状态
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      console.log(`✅ API响应成功:`, data);
      return data;
      
    } catch (error) {
      console.error(`❌ API请求失败:`, error);
      throw error;
    }
  }

  /**
   * 用户注册
   */
  async register(email, username, password, bio = '') {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        username,
        password,
        bio
      })
    });

    if (response.success) {
      // 保存令牌和用户信息
      this.token = response.data.token;
      localStorage.setItem('auth_token', this.token);
      localStorage.setItem('user_info', JSON.stringify(response.data.user));
      
      console.log('✅ 用户注册成功');
    }

    return response;
  }

  /**
   * 用户登录
   */
  async login(email, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password
      })
    });

    if (response.success) {
      // 保存令牌和用户信息
      this.token = response.data.token;
      localStorage.setItem('auth_token', this.token);
      localStorage.setItem('user_info', JSON.stringify(response.data.user));
      
      console.log('✅ 用户登录成功');
    }

    return response;
  }

  /**
   * 获取当前用户信息
   */
  async getProfile() {
    const response = await this.request('/auth/profile', {
      method: 'GET'
    });

    if (response.success) {
      // 更新本地用户信息
      localStorage.setItem('user_info', JSON.stringify(response.data.user));
    }

    return response;
  }

  /**
   * 更新用户信息
   */
  async updateProfile(username, bio, avatar_url) {
    const updateData = {};
    
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

    const response = await this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });

    if (response.success) {
      console.log('✅ 用户信息更新成功');
    }

    return response;
  }

  /**
   * 修改密码
   */
  async changePassword(currentPassword, newPassword) {
    const response = await this.request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    return response;
  }

  /**
   * 验证令牌有效性
   */
  async verifyToken() {
    try {
      const response = await this.request('/auth/verify', {
        method: 'GET'
      });
      return response.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * 退出登录
   */
  async logout() {
    try {
      await this.request('/auth/logout', {
        method: 'POST'
      });
    } catch (error) {
      console.log('退出登录请求失败，但继续清理本地数据');
    }

    // 清理本地数据
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    
    console.log('✅ 用户已退出登录');
  }

  /**
   * 根据ID获取书评详情
   */
  async getReviewById(reviewId) {
    const response = await this.request(`/reviews/${reviewId}`, {
      method: 'GET'
    });

    if (response.success) {
      console.log(`✅ 获取书评详情成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 记录书评浏览量
   */
  async recordView(reviewId) {
    const response = await this.request(`/reviews/${reviewId}/view`, {
      method: 'POST'
    });

    if (response.success) {
      console.log(`📊 浏览量记录成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 点赞书评
   */
  async likeReview(reviewId) {
    const response = await this.request(`/likes/reviews/${reviewId}`, {
      method: 'POST'
    });

    if (response.success) {
      console.log(`👍 点赞成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 取消点赞书评
   */
  async unlikeReview(reviewId) {
    const response = await this.request(`/likes/reviews/${reviewId}`, {
      method: 'DELETE'
    });

    if (response.success) {
      console.log(`👎 取消点赞成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 切换书评点赞状态
   */
  async toggleLike(reviewId, currentlyLiked) {
    if (currentlyLiked) {
      return await this.unlikeReview(reviewId);
    } else {
      return await this.likeReview(reviewId);
    }
  }

  /**
   * 收藏书评
   */
  async favoriteReview(reviewId) {
    const response = await this.request(`/favorites/reviews/${reviewId}`, {
      method: 'POST'
    });

    if (response.success) {
      console.log(`⭐ 收藏成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 取消收藏书评
   */
  async unfavoriteReview(reviewId) {
    const response = await this.request(`/favorites/reviews/${reviewId}`, {
      method: 'DELETE'
    });

    if (response.success) {
      console.log(`💔 取消收藏成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 切换书评收藏状态
   */
  async toggleFavorite(reviewId, currentlyFavorited) {
    if (currentlyFavorited) {
      return await this.unfavoriteReview(reviewId);
    } else {
      return await this.favoriteReview(reviewId);
    }
  }

  /**
   * 获取书评评论列表
   */
  async getReviewComments(reviewId, page = 1, limit = 20) {
    const response = await this.request(`/comments/reviews/${reviewId}?page=${page}&limit=${limit}`, {
      method: 'GET'
    });

    if (response.success) {
      console.log(`💬 获取评论列表成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 发表评论
   */
  async createComment(reviewId, content, parentId = null) {
    const response = await this.request(`/comments/reviews/${reviewId}`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        parent_id: parentId
      })
    });

    if (response.success) {
      console.log(`💬 发表评论成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 回复评论
   */
  async replyToComment(commentId, content) {
    const response = await this.request(`/comments/${commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        content
      })
    });

    if (response.success) {
      console.log(`💬 回复评论成功: ${commentId}`);
    }

    return response;
  }

  /**
   * 删除评论
   */
  async deleteComment(commentId) {
    const response = await this.request(`/comments/${commentId}`, {
      method: 'DELETE'
    });

    if (response.success) {
      console.log(`🗑️ 删除评论成功: ${commentId}`);
    }

    return response;
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return !!this.token;
  }

  /**
   * 获取当前用户信息（从localStorage）
   */
  getCurrentUser() {
    const userInfo = localStorage.getItem('user_info');
    return userInfo ? JSON.parse(userInfo) : null;
  }

  /**
   * 获取书籍列表
   */
  async getBooks(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    // 注意：search功能暂未在后端实现
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/books?${queryString}` : '/books';
    
    return await this.request(endpoint);
  }

  /**
   * 获取书籍详情
   */
  async getBook(bookId) {
    return await this.request(`/books/${bookId}`);
  }

  /**
   * 创建书籍
   */
  async createBook(bookData) {
    return await this.request('/books', {
      method: 'POST',
      body: JSON.stringify(bookData)
    });
  }

  /**
   * 获取书评列表
   */
  async getReviews(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.book_id) queryParams.append('book_id', params.book_id);
    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.status) queryParams.append('status', params.status);
    if (params.sort) queryParams.append('sort', params.sort);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/reviews?${queryString}` : '/reviews';
    
    return await this.request(endpoint);
  }

  /**
   * 获取书评详情
   */
  async getReview(reviewId) {
    return await this.request(`/reviews/${reviewId}`);
  }

  /**
   * 创建书评
   */
  async createReview(reviewData) {
    return await this.request('/reviews', {
      method: 'POST',
      body: JSON.stringify(reviewData)
    });
  }

  /**
   * 更新书评
   */
  async updateReview(reviewId, reviewData) {
    return await this.request(`/reviews/${reviewId}`, {
      method: 'PUT',
      body: JSON.stringify(reviewData)
    });
  }

  /**
   * 删除书评
   */
  async deleteReview(reviewId) {
    return await this.request(`/reviews/${reviewId}`, {
      method: 'DELETE'
    });
  }

  /**
   * 点赞书评
   */
  async likeReview(reviewId) {
    return await this.request(`/likes/reviews/${reviewId}`, {
      method: 'POST'
    });
  }

  /**
   * 取消点赞书评
   */
  async unlikeReview(reviewId) {
    return await this.request(`/likes/reviews/${reviewId}`, {
      method: 'DELETE'
    });
  }

  /**
   * 收藏书评
   */
  async favoriteReview(reviewId) {
    return await this.request(`/favorites/reviews/${reviewId}`, {
      method: 'POST'
    });
  }

  /**
   * 取消收藏书评
   */
  async unfavoriteReview(reviewId) {
    return await this.request(`/favorites/reviews/${reviewId}`, {
      method: 'DELETE'
    });
  }

  /**
   * 获取评论列表
   */
  async getComments(reviewId, params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.sort) queryParams.append('sort', params.sort);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/comments/reviews/${reviewId}?${queryString}` : `/comments/reviews/${reviewId}`;
    
    return await this.request(endpoint);
  }

  /**
   * 发表评论
   */
  async createComment(reviewId, content) {
    return await this.request(`/comments/reviews/${reviewId}`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  /**
   * 回复评论
   */
  async replyComment(commentId, content) {
    return await this.request(`/comments/${commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  /**
   * 错误处理辅助函数
   */
  handleError(error, defaultMessage = '操作失败') {
    if (error.message) {
      return error.message;
    }
    return defaultMessage;
  }
}

// 创建全局API实例
const api = new BookReviewerAPI();

// 兼容性函数 - 为了保持与Firebase代码的兼容性
const authCompat = {
  // 模拟Firebase的onAuthStateChanged
  onAuthStateChanged: (callback) => {
    // 检查当前登录状态
    const isLoggedIn = api.isLoggedIn();
    const currentUser = api.getCurrentUser();
    
    if (isLoggedIn && currentUser) {
      callback(currentUser);
    } else {
      callback(null);
    }
  },
  
  // 模拟Firebase的signOut
  signOut: async () => {
    await api.logout();
  }
};

// 导出API实例（用于模块化环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BookReviewerAPI, api, authCompat };
}

console.log('📚 API工具已加载，可以使用 api.login(), api.register() 等方法');
