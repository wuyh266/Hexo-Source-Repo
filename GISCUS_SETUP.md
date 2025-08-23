# Giscus 评论系统配置说明

## 什么是 Giscus？

Giscus 是一个基于 GitHub Discussions 的免费评论系统，具有以下特点：
- 🆓 完全免费
- 🔒 基于 GitHub 账户，安全可靠
- 🌙 支持深色/浅色主题
- 🌍 支持多语言
- 📱 响应式设计，移动端友好

## 配置步骤

### 1. 安装 Giscus 应用到 GitHub 仓库

**重要：这是必须的第一步！**

1. 访问 Giscus 应用页面：https://github.com/apps/giscus
2. 点击 "Install" 按钮
3. 选择 "Only select repositories"
4. 在下拉菜单中选择您的仓库：`wuyh266/wuyh266.github.io`
5. 点击 "Install" 完成安装

### 2. 启用 GitHub Discussions

1. 进入您的 GitHub 仓库：`https://github.com/wuyh266/wuyh266.github.io`
2. 点击 `Settings` 标签
3. 在左侧菜单中找到 `General` → `Features`
4. 勾选 `Discussions` 选项
5. 点击 `Save changes`

### 3. 创建 Discussions 分类

1. 在仓库页面点击 "Discussions" 标签
2. 点击 "New discussion"
3. 选择 "Announcements" 分类（或创建新分类）
4. 发布一个测试讨论

### 4. 获取配置信息

1. 访问 [giscus.app](https://giscus.app/)
2. 输入您的仓库信息：
   - Repository: `wuyh266/wuyh266.github.io`
   - Discussion Category: 选择您创建的分类
3. 复制生成的配置信息

### 5. 更新配置文件

将获取的信息更新到 `_config.butterfly.yml` 文件中：

```yaml
giscus:
  repo: wuyh266/wuyh266.github.io  # 您的GitHub仓库
  repo_id: R_kgDOJxxxxxxxxx        # 从giscus.app获取的仓库ID
  category_id: DIC_kwDOJxxxxxxxxx  # 从giscus.app获取的分类ID
  # ... 其他配置
```

**同时更新评论系统配置：**

```yaml
comments:
  use: Giscus  # 填入Giscus
  count: true  # 启用评论数显示
  card_post_count: true  # 启用首页评论数显示
```

### 6. 测试评论功能

1. 重新生成博客：`hexo clean && hexo generate && hexo server`
2. 访问留言板页面：`/comments/`
3. 使用 GitHub 账户登录并发表评论

## 配置选项说明

### 基础配置
- `repo`: GitHub 仓库地址
- `repo_id`: 仓库唯一标识符
- `category_id`: Discussions 分类标识符

### 主题配置
- `light_theme`: 浅色主题
- `dark_theme`: 深色主题
- `theme`: 自动主题切换

### 功能配置
- `reactionsEnabled`: 是否启用表情反应
- `inputPosition`: 评论输入框位置
- `lang`: 界面语言设置
- `mapping`: 页面映射方式

## 常见问题

### Q: 评论不显示怎么办？
A: 检查以下几点：
1. GitHub Discussions 是否已启用
2. 配置信息是否正确
3. 页面是否启用了 `comments: true`

### Q: 如何自定义评论样式？
A: 可以通过 CSS 自定义样式，在 `source/css/custom.css` 中添加样式规则。

### Q: 评论数据存储在哪里？
A: 所有评论数据都存储在 GitHub Discussions 中，无需担心数据丢失。

## 更多帮助

- [Giscus 官方文档](https://github.com/giscus/giscus)
- [Hexo Butterfly 主题文档](https://butterfly.js.org/)
- [GitHub Discussions 帮助](https://docs.github.com/en/discussions)
