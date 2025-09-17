# 📚 书评管理系统

一个基于Firebase的现代化书评管理系统，支持用户注册登录、书评发布、Markdown渲染等功能。

## ✨ 功能特性

- 🔐 **用户认证**: Firebase Authentication 邮箱登录/注册
- 📝 **书评管理**: 发布、浏览、搜索书评
- 🎨 **Markdown支持**: 书评内容支持Markdown语法渲染
- 📸 **图片上传**: GitHub作为图床，支持书籍封面上传
- 🌐 **响应式设计**: 适配桌面和移动端
- ⚡ **实时数据**: Firebase Firestore实时数据同步

## 🛠️ 技术栈

- **前端**: HTML5, CSS3, Vanilla JavaScript
- **后端服务**: Firebase (Authentication + Firestore)
- **图片存储**: GitHub API
- **Markdown渲染**: marked.js
- **部署**: Netlify / Firebase Hosting

## 📋 部署说明

### 1. 克隆项目

```bash
git clone https://github.com/您的用户名/book-review-system.git
cd book-review-system
```

### 2. 配置设置

1. **复制配置模板**:
   ```bash
   cp config-template.js config.js
   ```

2. **填写Firebase配置** (在 `config.js` 中):
   - 在 [Firebase控制台](https://console.firebase.google.com/) 创建项目
   - 启用 Authentication 和 Firestore
   - 获取配置信息并填入 `CONFIG.firebase`

3. **配置GitHub图床** (在 `config.js` 中):
   - 创建GitHub仓库用作图床
   - 生成 [Personal Access Token](https://github.com/settings/tokens) (需要 `repo` 权限)
   - 填入 `CONFIG.github` 配置

### 3. 部署选项

#### 选项A: Netlify部署 (推荐)

1. **通过Git部署**:
   - 登录 [Netlify](https://www.netlify.com/)
   - 连接GitHub仓库
   - 选择分支: `main`
   - 构建设置: 无需特殊设置
   - 点击部署

2. **手动上传配置**:
   - 部署后，在Netlify的文件管理中手动上传 `config.js`
   - 或通过Netlify CLI上传

#### 选项B: Firebase Hosting

```bash
# 安装Firebase CLI
npm install -g firebase-tools

# 登录Firebase
firebase login

# 初始化项目
firebase init hosting

# 部署
firebase deploy
```

#### 选项C: 其他静态托管

支持任何静态文件托管服务：
- GitHub Pages
- Vercel
- Surge.sh
- 等

**注意**: 部署后需要手动上传包含实际配置的 `config.js` 文件。

### 4. Firebase配置

1. **Authentication设置**:
   - 启用邮箱/密码登录方式
   - 配置授权域名 (添加您的部署域名)

2. **Firestore设置**:
   - 创建数据库 (测试模式)
   - 应用提供的安全规则 (见 `firestore.rules`)

3. **安全规则** (可选，生产环境推荐):
   ```javascript
   // firestore.rules
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // 用户只能读写自己的数据
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       
       // 所有人可读书评，登录用户可写
       match /reviews/{reviewId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
       
       // 所有人可读书籍信息，登录用户可写
       match /books/{bookId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```

## 🔧 本地开发

1. **启动本地服务器**:
   ```bash
   # 使用Python
   python -m http.server 8000
   
   # 或使用Node.js
   npx serve .
   
   # 或使用PHP
   php -S localhost:8000
   ```

2. **访问**: `http://localhost:8000`

## 📁 项目结构

```
book-review-system/
├── index.html              # 主页
├── config-template.js      # 配置模板
├── config.js              # 实际配置 (不上传到Git)
├── .gitignore             # Git忽略文件
├── pages/
│   ├── login.html         # 登录页面
│   ├── register.html      # 注册页面
│   └── add-review.html    # 发布书评页面
├── firebase.json          # Firebase项目配置
├── firestore.rules        # Firestore安全规则
└── README.md              # 项目说明
```

## 🚀 使用说明

1. **注册账号**: 使用邮箱注册新账号
2. **登录系统**: 使用注册的邮箱密码登录
3. **发布书评**: 支持Markdown语法的书评内容
4. **上传封面**: 点击书籍封面可上传图片到GitHub
5. **搜索功能**: 支持按书名、作者、书评标题搜索

## 🔐 安全注意事项

- ⚠️ **配置文件安全**: `config.js` 包含敏感信息，不要提交到公开仓库
- 🔑 **Token管理**: 定期更换GitHub Personal Access Token
- 🛡️ **域名限制**: 在Firebase中配置授权域名限制
- 📝 **安全规则**: 生产环境务必配置严格的Firestore安全规则

## 📞 技术支持

如有问题请联系课程助教或创建Issue。

---

**课程作业项目 - 信息安全程序设计**
