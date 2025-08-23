# 💬 Waline 留言系统部署指南

## 功能特点
- ✅ 只需要输入昵称即可留言
- ✅ 支持匿名评论
- ✅ 无需邮箱和网址
- ✅ 简洁美观的界面
- ✅ 支持表情包
- ✅ 自动适应明暗主题

## 快速部署步骤

### 第一步：部署Waline服务端

#### 方案1：使用Vercel部署（推荐）

1. **Fork Waline仓库**
   - 访问：https://github.com/walinejs/waline
   - 点击右上角的 "Fork" 按钮

2. **部署到Vercel**
   - 访问：https://vercel.com
   - 使用GitHub账号登录
   - 点击 "New Project"
   - 选择您fork的waline仓库
   - 点击 "Deploy"

3. **获取部署地址**
   - 部署完成后，Vercel会提供一个域名，如：`https://your-waline-project.vercel.app`

#### 方案2：使用Netlify部署

1. **Fork Waline仓库**（同上）

2. **部署到Netlify**
   - 访问：https://netlify.com
   - 使用GitHub账号登录
   - 点击 "New site from Git"
   - 选择您fork的waline仓库
   - 点击 "Deploy site"

### 第二步：配置环境变量

在部署平台中设置以下环境变量：

```bash
# 数据库配置（使用MongoDB）
MONGODB_URL=mongodb://your-mongodb-connection-string

# 安全配置
JWT_SECRET=your-jwt-secret-key
```

### 第三步：设置MongoDB数据库

1. **MongoDB Atlas（推荐，免费云数据库）**
   - 访问：https://www.mongodb.com/atlas
   - 注册并登录
   - 创建免费集群（M0级别，免费）

2. **获取连接字符串**
   - 在集群页面点击 "Connect"
   - 选择 "Connect your application"
   - 复制连接字符串，格式如：
     ```
     mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
     ```

3. **本地MongoDB（如果您有自己的MongoDB服务器）**
   - 连接字符串格式：
     ```
     mongodb://username:password@host:port/database
     ```

4. **配置环境变量**
   - 将MongoDB连接字符串填入部署平台的环境变量中
   - 变量名：`MONGODB_URL`

### 第四步：更新博客配置

部署完成后，更新您的 `_config.butterfly.yml` 文件中的 `serverURL`：

```yaml
waline:
  serverURL: https://your-waline-project.vercel.app  # 替换为您的部署地址
```

## 配置说明

### 当前配置特点

```yaml
waline:
  option:
    # 只要求昵称，不要求邮箱和网址
    requiredMeta: ['nick']
    # 显示昵称、邮箱、网址字段，但只有昵称必填
    meta: ['nick', 'mail', 'link']
    # 允许匿名评论
    anonymous: true
    # 禁用图片上传，简化功能
    imageUpload: false
    # 禁用审核，直接显示
    moderation: false
```

### 自定义样式（可选）

如果您想自定义留言框样式，可以在 `source/css/custom.css` 中添加：

```css
/* Waline留言框样式优化 */
.wl-panel {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.wl-input {
  border: 1px solid #e1e5e9;
  border-radius: 4px;
}

.wl-input:focus {
  border-color: #49b1f5;
  box-shadow: 0 0 0 2px rgba(73, 177, 245, 0.2);
}

.wl-btn {
  background: #49b1f5;
  border-radius: 4px;
}

.wl-btn:hover {
  background: #3a8ee6;
}
```

## 管理功能

### 访问管理面板
- 访问：`https://your-waline-project.vercel.app/ui`
- 使用您设置的邮箱和密码登录

### 管理功能
- ✅ 查看所有留言
- ✅ 删除不当留言
- ✅ 回复留言
- ✅ 数据导出
- ✅ 用户管理

## 验证部署

1. **重新生成博客**
   ```bash
   hexo clean && hexo generate
   ```

2. **启动本地服务器**
   ```bash
   hexo server
   ```

3. **测试留言功能**
   - 访问任意文章页面
   - 在留言框中输入昵称和留言内容
   - 点击提交，验证功能是否正常

## 常见问题

**Q: 部署后无法留言？**
A: 检查环境变量是否正确配置，特别是MongoDB连接字符串。

**Q: 如何修改留言框样式？**
A: 可以通过CSS自定义样式，或修改Waline的配置选项。

**Q: 如何备份留言数据？**
A: 在管理面板中可以导出数据，或直接备份MongoDB数据库。

**Q: 免费额度用完怎么办？**
A: MongoDB Atlas免费版有512MB存储空间，超出后可以升级或迁移到其他数据库。

## 下一步

完成部署后，您的博客将拥有一个简洁的留言系统，用户只需要输入昵称就可以留言，非常适合您的需求！
