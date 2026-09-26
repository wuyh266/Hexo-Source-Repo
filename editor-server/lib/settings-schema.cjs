// Shared by the API and Hexo generation. Only display settings are accepted.
const fields = { title: 100, subtitle: 200, description: 500, author: 80, avatar: 500, announcement: 5000, footerText: 1000, followText: 50, followUrl: 500 };
function safeUrl(value, optional = false) {
  if (optional && value === '') return value;
  if (/[\s<>"'\\|\x00-\x1f]/.test(value)) throw new Error('图片和导航地址不能包含空格、引号或特殊控制字符。');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let url; try { url = new URL(value); } catch { throw new Error('地址请填写 https:// 开头的网址或 / 开头的站内路径。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('外部地址必须使用 HTTPS，且不能包含用户名或密码。');
  return value;
}
function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('网站设置格式错误。');
  const keys = [...Object.keys(fields), 'subtitleEnabled', 'announcementEnabled', 'menu'];
  if (Object.keys(input).some(key => !keys.includes(key))) throw new Error('包含不允许修改的网站配置。');
  const result = {};
  for (const [key, limit] of Object.entries(fields)) {
    if (typeof input[key] !== 'string' || input[key].length > limit) throw new Error(`${key} 请填写不超过 ${limit} 个字符的文本。`);
    result[key] = input[key].trim();
  }
  if (!result.title || !result.author) throw new Error('博客名称和作者名不能为空。');
  for (const key of ['title', 'subtitle', 'description', 'author', 'followText']) {
    if (/[<>\x00-\x08]/.test(result[key])) throw new Error('名称和简介请填写纯文本，不包含 HTML 标签。');
  }
  for (const key of ['subtitleEnabled', 'announcementEnabled']) {
    if (typeof input[key] !== 'boolean') throw new Error('显示开关格式错误。');
    result[key] = input[key];
  }
  safeUrl(result.avatar); safeUrl(result.followUrl, true);
  if (!Array.isArray(input.menu) || input.menu.length > 12) throw new Error('导航菜单最多支持 12 项。');
  const labels = new Set();
  result.menu = input.menu.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['label', 'url', 'icon'].includes(key))) throw new Error('导航菜单格式错误。');
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 30 || /[<>/|\x00-\x1f]/.test(item.label) || ['__proto__', 'constructor', 'prototype'].includes(item.label)) throw new Error('导航名称需为 1–30 个字符，不能包含斜杠或 HTML。');
    if (typeof item.url !== 'string' || item.url.length > 500) throw new Error('导航地址过长或格式错误。');
    if (labels.has(item.label.trim())) throw new Error('导航名称不能重复。');
    labels.add(item.label.trim());
    const icon = item.icon || 'fas fa-link';
    if (typeof icon !== 'string' || !/^[a-z0-9 -]{1,60}$/.test(icon)) throw new Error('导航图标格式错误。');
    return { label: item.label.trim(), url: safeUrl(item.url.trim()), icon };
  });
  return result;
}
const escapeHTML = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])).replace(/\r?\n/g, '<br>');
function applySettings(hexo, raw) {
  const data = validateSettings(raw), theme = hexo.theme.config;
  for (const key of ['title', 'subtitle', 'description', 'author']) hexo.config[key] = data[key];
  theme.avatar = { ...theme.avatar, img: data.avatar };
  theme.subtitle = { ...theme.subtitle, enable: data.subtitleEnabled, source: false, sub: [data.subtitle] };
  theme.aside ||= {};
  theme.aside.card_announcement = { ...theme.aside.card_announcement, enable: data.announcementEnabled, content: escapeHTML(data.announcement) };
  theme.aside.card_author ||= {};
  theme.aside.card_author.description = escapeHTML(data.description);
  theme.aside.card_author.button = { ...theme.aside.card_author.button, enable: !!data.followUrl, text: data.followText, link: data.followUrl };
  theme.footer = { ...theme.footer, custom_text: escapeHTML(data.footerText) };
  theme.menu = Object.fromEntries(data.menu.map(item => [item.label, `${item.url} || ${item.icon}`]));
}
module.exports = { validateSettings, applySettings };
