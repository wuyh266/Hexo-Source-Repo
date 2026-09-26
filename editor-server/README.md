# Decwoveh 写作间

博客入口：`https://542501.xyz/editor/`。前端托管在现有 GitHub Pages；此目录是独立 Vercel 后台，不要覆盖原来的 Waline 项目。

## 已实现的功能

- 独立作者密码登录，服务端验证，4 小时会话；刷新需要重新登录。
- 新建文章、中文标题搜索、草稿箱、已发布文章管理。
- Markdown 左侧编辑、右侧实时预览；学习手记 / 算法题解 / 日常随笔模板。
- 手动保存、停止输入 3 秒后的自动云端保存、Ctrl/⌘+S、Markdown 导出。
- 私有草稿保存在 Neon，只有明确发布才提交到公开 GitHub 仓库。
- 已发布文章可以编辑后保留草稿，不会立即修改线上内容；支持放弃草稿修改。
- 删除需要确认；已发布内容可从 Git 历史恢复，未发布草稿删除不可恢复（除非另有导出/数据库备份）。
- 版本冲突保护、仓库写入互斥、失败保留草稿、提交成功但响应丢失时可重试。
- 手机编辑/预览切换、专注模式、减少动效支持、未保存离开提醒。

**当前仅有代码和静态页面不代表云端已经接通。必须完成以下一次性配置，才能真正登录、保存和发布。离线试写只是体验，刷新会丢失，不写入数据库。**

## 一次性配置（全程可用网页，不安装 Vercel CLI）

### 1. 初始化草稿数据库

在 Neon 中打开现有项目的 SQL Editor，复制本目录 `schema.sql` 的全部内容运行。

它只创建 `blog_editor` schema 下的三张表，不会修改 Waline 的评论、账号或序列。脚本可以重复运行。

从 Neon 的 Connect 页面复制连接串，用于稍后的 `DATABASE_URL`。不要把连接串贴到聊天、文章、截图或 GitHub 源码里。可优先使用独立数据库/专用角色隔离权限；如果复用现有数据库，至少使用独立 schema。

### 2. 准备仅此仓库可用的 GitHub 令牌

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。

- Repository access：只选择 `wuyh266/Hexo-Source-Repo`。
- Repository permissions → Contents：Read and write。
- Metadata：默认只读即可；不需要 Workflows 写权限或账号管理权限。
- 设置合适的到期时间，到期后在 Vercel 更新并重新部署。

只将令牌填入 Vercel 的 `GITHUB_TOKEN` 环境变量，**不要填进前端 config.json、文章或浏览器存储**。

### 3. 新建独立 Vercel 项目

Vercel → Add New → Project → 导入 `wuyh266/Hexo-Source-Repo`。

| 设置 | 值 |
|---|---|
| 项目名 | 自选，例如 `decwoveh-editor` |
| Framework Preset | Other |
| Root Directory | `editor-server` |
| Node.js Version | 22.x |
| Build Command | 留空（仓库 vercel.json 已设置） |
| Output Directory | `public`（相对于 editor-server） |
| Install Command | 默认 `npm install` 或 `npm ci` |

环境变量（选择 Production；若要预览环境再单独配置）：

| 名称 | 内容 |
|---|---|
| `EDITOR_PASSWORD` | 独立作者密码，至少 16 个字符，建议密码管理器生成的随机密码；不是 Waline 密码 |
| `SESSION_SECRET` | 独立随机密钥，至少 32 个字符；建议随机 64 位十六进制字符串 |
| `DATABASE_URL` | Neon 完整连接串，包含 `sslmode=require` |
| `GITHUB_TOKEN` | 上一步的 fine-grained token |
| `GITHUB_REPOSITORY` | `wuyh266/Hexo-Source-Repo` |
| `GITHUB_BRANCH` | `main` |
| `ALLOWED_ORIGINS` | `https://542501.xyz`，不加结尾斜杠 |
| `BLOG_URL` | `https://542501.xyz` |

不要使用 `.env.example` 中的示例密码，后台会拒绝启动。不要将真实 `.env` 提交到 GitHub。

部署后使用稳定的 Production 域名，不使用单次部署的临时域名。生产 API 需要能被博客跨域调用；如果 Vercel 的 Deployment Protection 拦截了生产域名，请仅针对这个独立后台按需调整访问保护，并保留应用本身的作者密码、来源校验和限流。不要关闭其他项目的保护。

### 4. 在写作间登录

打开博客 `/editor/`，输入独立作者密码。正式后台固定为 `https://blog-editor-pied.vercel.app`，登录页不再提供修改后台地址的入口。

凭证请求地址固定在 `tools/editor-app.mjs` 的 `EDITOR_API` 常量中，并由 `source/editor/index.html` 的 CSP 限制连接目标。浏览器旧地址偏好会被清除，URL 参数和 `config.json` 不参与后台地址选择，请求不跟随重定向。以后迁移后台时，需要同步修改常量和 CSP，重新编译并发布前端。

### 5. 做一次上线验收

1. 新建一篇测试文章 → 保存草稿 → 刷新并重新登录，确认草稿还在。
2. 确认公开博客暂时看不到草稿。
3. 点击发布 → 确认 → 打开「查看构建进度」，等待 GitHub Pages 构建完成。
4. 打开文章链接，确认内容和分类正常。提交成功不等于网站构建成功。
5. 修改文章并只保存草稿，确认线上旧版本不变。
6. 可删除测试文章并等待构建，最后在 GitHub 历史里仍能找到已发布版本。

上线验收会创建/删除真实文章，请只对自己创建的测试文章操作。

## 日常写作

文章顶部的 `title` 是标题，`categories` 是分类，`tags` 是标签。照着模板替换即可；列表项每行以两个空格和 `- ` 开头。分类按当前 Hexo 习惯可写为层级列表。不要更改 `abbrlink`，它决定永久网址。

预览支持标准 Markdown、GFM 表格和代码块。不执行原始脚本、Hexo 插件或主题特有标签，代码高亮/公式等最终效果以已生成的博客为准。

图片目前使用 Markdown 图片链接，不提供上传图床。单篇文章最大 500 KB，不支持把图片以 Base64 塞进文章。

发布会把 Markdown 写入 `source/_posts/`，触发现有 GitHub Actions。**GitHub Pages 更新后，本地仓库不会自动同步**；下次本地写作前先同步远程，存在本地改动时不要强行覆盖。

密码及会话只存在当前页内存，草稿不会缓存到 localStorage。登录过期时不要刷新：重新登录即可继续未保存内容。关页前先保存或导出。修改 `SESSION_SECRET` 并重新部署可以让旧令牌失效（普通退出只清除本页会话）。

## 本地开发（可选）

博客仍按原来的方式启动：`npm run server`，打开 `http://localhost:4000/editor/`。不配置后台也可以点「离线试写」。

后台调试需要 Node 22：在 `editor-server` 目录 `npm ci`，复制 `.env.example` 为被忽略的 `.env` 并自行填入密钥。在 `ALLOWED_ORIGINS` 里额外加入 `http://localhost:4000`（逗号分隔）；运行 `npm run dev`，服务只监听 `127.0.0.1:4318`。如需联调，应在独立的本地开发副本中同步修改 `EDITOR_API` 和 CSP 并重新编译；不要将 localhost 配置发布到正式网站。

修改编辑器逻辑后：`npm run build:editor` 会将 `tools/editor-app.mjs`、`tools/preview.mjs` 与固定依赖编译为 `source/editor/app.js`。HTML 和 CSS 在 `source/editor/`。不需外部 CDN，许可证在 `app.js.LEGAL.txt`。

测试：`npm test`。覆盖鉴权、CORS、私有草稿、并发版本、GitHub 发布重试、路径校验、真实 PostgreSQL 测试引擎、HTML 清理以及模拟 DOM 中的完整页面交互。它们不使用真实 GitHub/Neon 密钥，不修改线上数据；模拟 DOM 测试不能替代实际浏览器的视觉验收。

设计采用用户指定 frontend-slides 技能的 Notebook / Editorial 排版与克制动效，并沿用 Butterfly 蓝白配色；实际产品是响应式编辑应用，不是固定比例幻灯片。

## 官方参考

- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)：文章写入、删除及 SHA 校验。
- [Neon Serverless Driver](https://github.com/neondatabase/serverless)：参数化 PostgreSQL 请求。
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)：独立 API 部署。
