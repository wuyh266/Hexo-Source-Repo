// 统计数据显示优化
document.addEventListener('DOMContentLoaded', function() {
  // 处理不蒜子统计加载超时
  setTimeout(function() {
    const busuanziElements = document.querySelectorAll('#busuanzi_container_site_pv, #busuanzi_container_site_uv, #busuanzi_container_page_pv');
    busuanziElements.forEach(function(element) {
      if (element.innerHTML === '' || element.innerHTML.includes('busuanzi')) {
        element.innerHTML = '0';
      }
    });
  }, 5000); // 5秒后如果还没加载完成就显示0

  // 处理评论数显示
  setTimeout(function() {
    const commentCountElements = document.querySelectorAll('.card-post-count');
    commentCountElements.forEach(function(element) {
      if (element.innerHTML === '' || element.innerHTML.includes('loading')) {
        element.innerHTML = '0';
      }
    });
  }, 3000); // 3秒后如果还没加载完成就显示0
});

// 监听页面变化（用于pjax）
document.addEventListener('pjax:complete', function() {
  setTimeout(function() {
    const busuanziElements = document.querySelectorAll('#busuanzi_container_site_pv, #busuanzi_container_site_uv, #busuanzi_container_page_pv');
    busuanziElements.forEach(function(element) {
      if (element.innerHTML === '' || element.innerHTML.includes('busuanzi')) {
        element.innerHTML = '0';
      }
    });
  }, 3000);
});
