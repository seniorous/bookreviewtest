// 配置模板文件
// 使用说明：
// 1. 复制此文件为 config.js
// 2. 填入您的实际配置信息
// 3. config.js 不会被上传到 Git

const CONFIG = {
  // Firebase 配置
  firebase: {
    apiKey: "您的Firebase API Key",
    authDomain: "您的项目.firebaseapp.com", 
    projectId: "您的项目ID",
    messagingSenderId: "您的Sender ID",
    appId: "您的App ID"
  },
  
  // GitHub 图床配置
  github: {
    username: '您的GitHub用户名',
    repo: '您的图床仓库名',
    token: '您的GitHub Personal Access Token',
    branch: 'main'
  }
};
