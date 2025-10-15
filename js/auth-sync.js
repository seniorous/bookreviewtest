/**
 * 认证状态同步工具
 * 
 * 功能：
 * 1. 多标签页登录状态同步
 * 2. Token 过期检测和自动跳转
 * 3. 登出时清除所有标签页的状态
 * 
 * 使用方法：
 * 在所有页面的 <head> 中引入：
 * <script src="../js/auth-sync.js"></script>
 */

(function() {
  'use strict';

  // ========== Token 过期检测 ==========
  
  /**
   * 解码 JWT Token（不验证签名，仅解析）
   */
  function decodeJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      console.error('❌ JWT 解析失败:', error);
      return null;
    }
  }

  /**
   * 检查 Token 是否过期
   */
  function isTokenExpired(token) {
    if (!token) return true;
    
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) return true;
    
    const now = Math.floor(Date.now() / 1000);  // 当前时间戳（秒）
    const expiresAt = payload.exp;
    
    return now >= expiresAt;
  }

  /**
   * 获取Token剩余有效期（秒）
   */
  function getTokenRemainingTime(token) {
    if (!token) return 0;
    
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) return 0;
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = payload.exp - now;
    
    return Math.max(0, remaining);
  }

  /**
   * 检查并处理过期Token
   */
  function checkTokenExpiration() {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      // 没有 Token，但可能有 Cookie，允许继续
      return;
    }
    
    if (isTokenExpired(token)) {
      console.warn('⚠️ Token 已过期，清除本地状态');
      
      // 清除本地存储
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      
      // 如果当前页面需要登录，跳转到登录页
      const currentPath = window.location.pathname;
      const publicPages = ['/', '/index.html', '/pages/login.html', '/pages/register.html'];
      
      const isPublicPage = publicPages.some(page => currentPath.endsWith(page));
      
      if (!isPublicPage) {
        alert('登录已过期，请重新登录');
        window.location.href = '/pages/login.html';
      }
    } else {
      const remaining = getTokenRemainingTime(token);
      console.log(`✅ Token 有效，剩余时间: ${Math.floor(remaining / 60)} 分钟`);
    }
  }

  // ========== 多标签页同步 ==========
  
  /**
   * 监听 localStorage 变化（多标签页同步）
   */
  window.addEventListener('storage', function(event) {
    // storage 事件只在其他标签页修改时触发，不会在当前标签页触发
    
    if (event.key === 'auth_token') {
      if (event.newValue === null) {
        // Token 被删除（用户在其他标签页退出登录）
        console.log('📢 检测到其他标签页退出登录，同步退出');
        
        // 清除本地用户信息
        localStorage.removeItem('user_info');
        
        // 刷新页面或跳转到登录页
        const currentPath = window.location.pathname;
        if (currentPath.includes('/pages/profile.html') || 
            currentPath.includes('/pages/add-review.html')) {
          alert('您已在其他标签页退出登录');
          window.location.href = '/pages/login.html';
        } else {
          // 首页等公共页面，刷新以更新登录状态
          window.location.reload();
        }
      } else if (event.newValue !== event.oldValue) {
        // Token 被更新（用户在其他标签页登录）
        console.log('📢 检测到其他标签页登录，同步登录状态');
        
        // 刷新页面以更新状态
        window.location.reload();
      }
    }
    
    if (event.key === 'user_info') {
      if (event.newValue === null) {
        console.log('📢 检测到用户信息被清除');
      } else if (event.newValue !== event.oldValue) {
        console.log('📢 检测到用户信息更新，刷新页面');
        window.location.reload();
      }
    }
  });

  // ========== 页面加载时检查 ==========
  
  // 页面加载时检查 Token 是否过期
  document.addEventListener('DOMContentLoaded', function() {
    checkTokenExpiration();
    
    // 每5分钟检查一次 Token 是否过期
    setInterval(checkTokenExpiration, 5 * 60 * 1000);
  });

  // 如果 DOMContentLoaded 已经触发，立即执行
  if (document.readyState === 'loading') {
    // DOMContentLoaded 事件还未触发
  } else {
    // DOM 已经加载完成，立即执行
    checkTokenExpiration();
    setInterval(checkTokenExpiration, 5 * 60 * 1000);
  }

  // ========== 全局工具函数 ==========
  
  // 导出到全局作用域
  window.AuthSync = {
    isTokenExpired,
    getTokenRemainingTime,
    checkTokenExpiration,
    decodeJWT
  };

  console.log('🔐 认证同步工具已加载');

})();

