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
    
    if (this.token) {
      console.log('🔐 检测到已保存的认证令牌');
      // 检查是否有用户信息
      const userInfo = localStorage.getItem('user_info');
      if (userInfo) {
        try {
          const user = JSON.parse(userInfo);
          console.log('👤 检测到已保存的用户信息:', user.username);
        } catch (e) {
          console.warn('⚠️ 用户信息解析失败，清理本地数据');
          localStorage.removeItem('user_info');
        }
      }
    } else {
      console.log('📭 未检测到认证令牌，用户未登录');
    }
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
      credentials: 'include',  // 关键：允许发送和接收 Cookie
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
  async login(email, password, rememberMe = false) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        rememberMe  // 传递记住我选项
      })
    });

    if (response.success) {
      // 保存令牌和用户信息到 localStorage（用于快速访问）
      // 实际的Token已经通过Cookie存储，更安全
      this.token = response.data.token;
      localStorage.setItem('auth_token', this.token);
      localStorage.setItem('user_info', JSON.stringify(response.data.user));
      
      console.log(`✅ 用户登录成功 (记住我: ${rememberMe ? '是' : '否'})`);
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
      return response;
    } catch (error) {
      return { success: false, message: error.message };
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
   * 获取书评详情（根据ID）
   * 别名：getReviewById 保持向后兼容
   */
  async getReview(reviewId) {
    return await this.request(`/reviews/${reviewId}`);
  }
  
  // 兼容旧代码的别名
  async getReviewById(reviewId) {
    return await this.getReview(reviewId);
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
   * 获取书评评论列表
   * 别名：getReviewComments 保持向后兼容
   */
  async getComments(reviewId, params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.sort) queryParams.append('sort', params.sort);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/comments/reviews/${reviewId}?${queryString}` : `/comments/reviews/${reviewId}`;
    
    const response = await this.request(endpoint);

    if (response.success) {
      console.log(`💬 获取评论列表成功: ${reviewId}`);
    }

    return response;
  }
  
  // 兼容旧代码的别名
  async getReviewComments(reviewId, page = 1, limit = 20) {
    return await this.getComments(reviewId, { page, limit });
  }

  /**
   * 发表评论
   */
  async createComment(reviewId, content, parentId = null) {
    const requestBody = { content };
    if (parentId) {
      requestBody.parent_id = parentId;
    }
    
    const response = await this.request(`/comments/reviews/${reviewId}`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });

    if (response.success) {
      console.log(`💬 发表评论成功: ${reviewId}`);
    }

    return response;
  }

  /**
   * 回复评论
   * 别名：replyToComment 保持向后兼容
   */
  async replyComment(commentId, content) {
    const response = await this.request(`/comments/${commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });

    if (response.success) {
      console.log(`💬 回复评论成功: ${commentId}`);
    }

    return response;
  }
  
  // 兼容旧代码的别名
  async replyToComment(commentId, content) {
    return await this.replyComment(commentId, content);
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
   * 获取用户资料
   */
  async getUserProfile(userId = null) {
    const endpoint = userId ? `/profile/${userId}` : '/auth/profile';
    return await this.request(endpoint);
  }

  /**
   * 更新用户资料
   */
  async updateUserProfile(data) {
    return await this.request('/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * 上传头像
   */
  /**
   * 上传头像
   * @param {File} file - 图片文件
   * @returns {Promise<Object>} 返回包含 avatar_url 的对象
   */
  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    
    const url = `${this.baseURL}/profile/avatar`;
    
    try {
      console.log('📡 API请求: POST /profile/avatar');
      console.log('📷 文件信息:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
          // 注意：不要设置 Content-Type，让浏览器自动设置 multipart/form-data 边界
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      console.log('✅ API响应成功:', data);
      
      // 提取并返回 avatar_url（兼容不同返回格式）
      let avatarUrl = null;
      
      if (data.success && data.data && data.data.avatar_url) {
        avatarUrl = data.data.avatar_url;
      } else if (data.data && typeof data.data === 'string') {
        avatarUrl = data.data;
      } else if (data.avatar_url) {
        avatarUrl = data.avatar_url;
      }
      
      if (!avatarUrl) {
        console.error('❌ 无法提取头像URL，完整响应:', data);
        throw new Error('服务器未返回有效的头像URL');
      }
      
      console.log('✅ 提取的头像URL:', avatarUrl);
      return avatarUrl;
      
    } catch (error) {
      console.error('❌ 头像上传失败:', error);
      throw error;
    }
  }

  /**
   * 删除头像（恢复默认头像）
   */
  async deleteAvatar() {
    return await this.request('/profile/avatar', {
      method: 'DELETE'
    });
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
