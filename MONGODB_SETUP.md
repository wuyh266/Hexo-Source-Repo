# 🗄️ MongoDB Atlas 数据库设置指南

## 为什么选择MongoDB Atlas？

- ✅ **免费额度**：512MB存储空间，足够个人博客使用
- ✅ **全球部署**：可选择离您最近的服务器
- ✅ **自动备份**：数据安全有保障
- ✅ **简单易用**：图形化界面，无需复杂配置
- ✅ **扩展性强**：随时可以升级到付费版本

## 详细设置步骤

### 第一步：注册MongoDB Atlas账号

1. **访问官网**
   - 打开：https://www.mongodb.com/atlas
   - 点击 "Try Free" 或 "Get started free"

2. **创建账号**
   - 填写邮箱、密码
   - 选择 "I'm learning MongoDB"（学习用途）
   - 点击 "Create account"

### 第二步：创建免费集群

1. **选择计划**
   - 选择 "FREE" 计划（M0级别）
   - 点击 "Create"

2. **选择云服务商和地区**
   - 推荐选择：
     - **AWS** + **Asia Pacific (Tokyo)** - 日本东京，国内访问较快
     - **Google Cloud** + **asia-east1** - 台湾，速度也不错
   - 点击 "Create"

3. **等待部署**
   - 集群创建需要2-3分钟
   - 状态变为 "Active" 表示创建完成

### 第三步：配置数据库访问

1. **创建数据库用户**
   - 在左侧菜单点击 "Database Access"
   - 点击 "Add New Database User"
   - 选择 "Password" 认证方式
   - 设置用户名和密码（请记住这些信息）
   - 权限选择 "Read and write to any database"
   - 点击 "Add User"

2. **配置网络访问**
   - 在左侧菜单点击 "Network Access"
   - 点击 "Add IP Address"
   - 选择 "Allow Access from Anywhere"（允许所有IP访问）
   - 点击 "Confirm"

### 第四步：获取连接字符串

1. **获取连接信息**
   - 回到 "Database" 页面
   - 点击集群名称旁边的 "Connect" 按钮
   - 选择 "Connect your application"

2. **复制连接字符串**
   - 选择驱动版本：**Node.js**
   - 版本选择：**5.0 or later**
   - 复制连接字符串，格式如下：
   ```
   mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
   ```

3. **修改连接字符串**
   - 将 `<password>` 替换为您的实际密码
   - 在 `?` 前添加数据库名称，如：
   ```
   mongodb+srv://username:password@cluster.mongodb.net/waline?retryWrites=true&w=majority
   ```

### 第五步：配置环境变量

在您的部署平台（Vercel/Netlify/Railway）中设置环境变量：

```bash
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/waline?retryWrites=true&w=majority
JWT_SECRET=your-random-secret-key
```

## 本地MongoDB设置（可选）

如果您有自己的MongoDB服务器，连接字符串格式为：

```bash
mongodb://username:password@host:port/database
```

示例：
```bash
mongodb://admin:password123@localhost:27017/waline
```

## 验证连接

部署完成后，可以通过以下方式验证：

1. **访问管理面板**
   - 访问：`https://your-waline-domain.com/ui`
   - 注册管理员账号
   - 登录后查看是否能正常访问

2. **测试留言功能**
   - 在博客文章页面测试留言
   - 检查留言是否正常保存

## 常见问题

**Q: 连接字符串格式错误？**
A: 确保连接字符串包含正确的用户名、密码和数据库名称。

**Q: 无法连接到MongoDB？**
A: 检查网络访问设置，确保允许了所有IP访问。

**Q: 免费额度用完怎么办？**
A: MongoDB Atlas免费版有512MB存储空间，对于留言系统通常足够。如果超出，可以升级到付费版本。

**Q: 如何备份数据？**
A: MongoDB Atlas提供自动备份功能，也可以在管理面板中导出数据。

## 安全建议

1. **强密码**：使用包含大小写字母、数字和特殊字符的强密码
2. **定期更新**：定期更新数据库用户密码
3. **监控访问**：定期检查数据库访问日志
4. **备份数据**：定期备份重要数据

## 下一步

完成MongoDB设置后，请按照 `WALINE_SETUP.md` 指南继续部署Waline服务。
