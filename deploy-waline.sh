#!/bin/bash

# 🚀 Waline 一键部署脚本
# 这个脚本将帮助您快速部署Waline留言系统

echo "🎉 欢迎使用 Waline 留言系统部署脚本！"
echo "=================================="

# 检查是否安装了必要的工具
check_requirements() {
    echo "📋 检查部署环境..."
    
    if ! command -v git &> /dev/null; then
        echo "❌ 未找到 git，请先安装 git"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo "❌ 未找到 node，请先安装 Node.js"
        exit 1
    fi
    
    echo "✅ 环境检查通过"
}

# 显示部署选项
show_options() {
    echo ""
    echo "请选择部署方式："
    echo "1) Vercel 部署（推荐，免费且简单）"
    echo "2) Netlify 部署（免费，功能丰富）"
    echo "3) Railway 部署（免费额度有限）"
    echo "4) 本地部署（需要服务器）"
    echo "5) 退出"
    echo ""
    read -p "请输入选项 (1-5): " choice
}

# Vercel部署指南
vercel_deploy() {
    echo ""
    echo "🚀 Vercel 部署指南"
    echo "=================="
    echo ""
    echo "1️⃣ Fork Waline 仓库"
    echo "   访问: https://github.com/walinejs/waline"
    echo "   点击右上角的 'Fork' 按钮"
    echo ""
    echo "2️⃣ 部署到 Vercel"
    echo "   访问: https://vercel.com"
    echo "   使用 GitHub 账号登录"
    echo "   点击 'New Project'"
    echo "   选择您 fork 的 waline 仓库"
    echo "   点击 'Deploy'"
    echo ""
    echo "3️⃣ 配置环境变量"
    echo "   在 Vercel 项目设置中添加以下环境变量："
    echo "   MONGODB_URL=your-mongodb-connection-string"
    echo "   JWT_SECRET=your-jwt-secret-key"
    echo ""
    echo "4️⃣ 获取部署地址"
    echo "   部署完成后，复制 Vercel 提供的域名"
    echo ""
    echo "5️⃣ 更新博客配置"
    echo "   将域名更新到 _config.butterfly.yml 文件中"
    echo ""
}

# Netlify部署指南
netlify_deploy() {
    echo ""
    echo "🚀 Netlify 部署指南"
    echo "=================="
    echo ""
    echo "1️⃣ Fork Waline 仓库"
    echo "   访问: https://github.com/walinejs/waline"
    echo "   点击右上角的 'Fork' 按钮"
    echo ""
    echo "2️⃣ 部署到 Netlify"
    echo "   访问: https://netlify.com"
    echo "   使用 GitHub 账号登录"
    echo "   点击 'New site from Git'"
    echo "   选择您 fork 的 waline 仓库"
    echo "   点击 'Deploy site'"
    echo ""
    echo "3️⃣ 配置环境变量"
    echo "   在 Netlify 项目设置中添加环境变量"
    echo ""
}

# Railway部署指南
railway_deploy() {
    echo ""
    echo "🚀 Railway 部署指南"
    echo "=================="
    echo ""
    echo "1️⃣ Fork Waline 仓库"
    echo "   访问: https://github.com/walinejs/waline"
    echo "   点击右上角的 'Fork' 按钮"
    echo ""
    echo "2️⃣ 部署到 Railway"
    echo "   访问: https://railway.app"
    echo "   使用 GitHub 账号登录"
    echo "   点击 'New Project'"
    echo "   选择 'Deploy from GitHub repo'"
    echo "   选择您 fork 的 waline 仓库"
    echo ""
}

# MongoDB设置指南
mongodb_setup() {
    echo ""
    echo "🗄️ MongoDB 数据库设置"
    echo "====================="
    echo ""
    echo "1️⃣ MongoDB Atlas（推荐，免费云数据库）"
    echo "   访问: https://www.mongodb.com/atlas"
    echo "   注册并登录"
    echo "   创建免费集群（M0级别，免费）"
    echo ""
    echo "2️⃣ 获取连接字符串"
    echo "   在集群页面点击 'Connect'"
    echo "   选择 'Connect your application'"
    echo "   复制连接字符串"
    echo ""
    echo "3️⃣ 本地MongoDB（如果您有自己的MongoDB服务器）"
    echo "   连接字符串格式:"
    echo "   mongodb://username:password@host:port/database"
    echo ""
    echo "4️⃣ 配置环境变量"
    echo "   将MongoDB连接字符串填入部署平台的环境变量中"
    echo "   变量名: MONGODB_URL"
    echo ""
}

# 更新博客配置
update_blog_config() {
    echo ""
    echo "📝 更新博客配置"
    echo "=============="
    echo ""
    echo "请将您的 Waline 服务地址更新到配置文件中："
    echo ""
    echo "文件: _config.butterfly.yml"
    echo "位置: waline.serverURL"
    echo ""
    echo "示例:"
    echo "waline:"
    echo "  serverURL: https://your-waline-project.vercel.app"
    echo ""
}

# 主函数
main() {
    check_requirements
    
    while true; do
        show_options
        
        case $choice in
            1)
                vercel_deploy
                mongodb_setup
                update_blog_config
                break
                ;;
            2)
                netlify_deploy
                mongodb_setup
                update_blog_config
                break
                ;;
            3)
                railway_deploy
                mongodb_setup
                update_blog_config
                break
                ;;
            4)
                echo "本地部署需要更多配置，请参考官方文档"
                break
                ;;
            5)
                echo "👋 再见！"
                exit 0
                ;;
            *)
                echo "❌ 无效选项，请重新选择"
                ;;
        esac
    done
    
    echo ""
    echo "🎉 部署指南已显示完成！"
    echo ""
    echo "📚 更多信息请查看:"
    echo "   - Waline 官方文档: https://waline.js.org/"
    echo "   - 部署指南: WALINE_SETUP.md"
    echo ""
    echo "💡 提示: 完成部署后，记得更新博客配置文件中的 serverURL"
    echo ""
}

# 运行主函数
main
