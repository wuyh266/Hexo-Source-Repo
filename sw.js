/*
 * @Description: sw
 * @Author: Decwoveh
 * @Email: 2268025923@qq.com
 * @Date: 2022-02-22 11:23:58
 * @LastEditTime: 2022-03-08 12:24:30
 * @LastEditors: Decwoveh
 */
const workboxVersion = "5.1.3";

importScripts(`https://storage.googleapis.com/workbox-cdn/releases/${workboxVersion}/workbox-sw.js`);

// 配置缓存名称前缀
workbox.core.setCacheNameDetails({
  prefix: "Decwoveh",
});

// 强制等待中的 Service Worker 立即激活
workbox.core.skipWaiting();
// 激活后立即控制所有打开的客户端
workbox.core.clientsClaim();

// 预缓存资源（由 Workbox 自动生成的清单）
workbox.precaching.precacheAndRoute([{"revision":"8efd16ec79c67a61f6da4979735838e2","url":"./index.html"},{"revision":"4c11ba828ea62466a7062baa8a4b43ad","url":"./js/main.js"},{"revision":"62fde016dca3ca097f1c2ed27de89126","url":"./css/index.css"}], {
  directoryIndex: null,
});

// 清理过期缓存
workbox.precaching.cleanupOutdatedCaches();

// ------------------------------
// 补充必要的事件监听
// ------------------------------

// 安装事件：缓存关键资源（如预缓存失败时的降级处理）
self.addEventListener('install', (event) => {
  // 等待预缓存完成后再完成安装
  event.waitUntil(
    self.skipWaiting() // 安装完成后立即激活
  );
});

// 激活事件：清理旧版本缓存，确保新 SW 生效
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // 接管所有客户端
    self.clients.claim()
  );
});

// Fetch 事件：处理网络请求（优先使用缓存，无缓存则请求网络）
self.addEventListener('fetch', (event) => {
  // 忽略非 GET 请求（如 POST/PUT 等，避免缓存非幂等请求）
  if (event.request.method !== 'GET') return;

  // Never cache private editing traffic or third-party API responses.
  const requestURL = new URL(event.request.url);
  if (requestURL.origin !== self.location.origin ||
      requestURL.pathname.startsWith('/editor') ||
      event.request.headers.has('Authorization')) return;

  // 自定义缓存策略：优先缓存，无缓存则请求网络
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // 无论缓存是否命中，都同时发起网络请求更新缓存
        const fetchPromise = fetch(event.request).then(networkResponse => {
          caches.open('runtime-cache').then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        });

        // 优先返回缓存，无缓存则等待网络请求
        return cachedResponse || fetchPromise;
      })
      .catch(() => {
        // 网络错误时的降级处理（如返回离线页面）
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html'); // 需确保项目中有 offline.html
        }
      })
  );
});

// ------------------------------
// 现有缓存策略配置（保持不变）
// ------------------------------

// 字体文件缓存
workbox.routing.registerRoute(
  /\.(?:eot|ttf|woff|woff2)$/,
  new workbox.strategies.CacheFirst({
    cacheName: "fonts",
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// 谷歌字体缓存
workbox.routing.registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
  })
);
workbox.routing.registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new workbox.strategies.CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// 谷歌分析数据缓存（确保离线时也能上报）
workbox.googleAnalytics.initialize();
