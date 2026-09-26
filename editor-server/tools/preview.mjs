import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import yaml from 'js-yaml';

export function readMarkdown(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) return { title: '未命名手记', body: raw, data: {}, warning: '缺少文章信息。可以应用模板，或补上开头的 YAML 信息。' };
  try {
    const data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return { title: typeof data.title === 'string' ? data.title : '未命名手记', data, body: raw.slice(match[0].length), warning: '' };
  } catch { return { title: '文章信息待完善', data: {}, body: raw.slice(match[0].length), warning: '顶部 YAML 格式有误：请检查冒号后空格、缩进与引号。正文仍可预览和保存草稿。' }; }
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function renderPreview(raw, windowObject) {
  const info = readMarkdown(raw);
  const purifier = createDOMPurify(windowObject);
  const safe = purifier.sanitize(marked.parse(info.body, { gfm: true, breaks: true }), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'video', 'audio'], FORBID_ATTR: ['style', 'id', 'name', 'srcset'] });
  const categories = Array.isArray(info.data.categories) ? info.data.categories.flat().filter(v => typeof v === 'string') : [];
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>*{box-sizing:border-box}body{margin:0;padding:30px 32px 55px;color:#344a5c;font:14px/1.95 'Noto Sans SC','Microsoft YaHei',sans-serif;overflow-wrap:anywhere}header{padding-bottom:22px;border-bottom:1px solid #e9eff3;margin-bottom:25px}header>p:first-child{font:9px Consolas,monospace;letter-spacing:2px;color:#82a5ba}h1{font:600 26px/1.65 'Noto Serif SC','Songti SC',SimSun,serif;color:#20384b;margin:15px 0 12px}header small{font-size:10px;color:#8397a5}h2{font-size:20px;margin:28px 0 16px;color:#20384b}h3{font-size:17px;margin:25px 0 12px}p{margin:13px 0}blockquote{border-left:3px solid #49b1f5;background:#f0f8fd;padding:9px 16px;margin:20px 0;color:#608397}blockquote p{margin:4px 0}pre{background:#f4f7fa;border:1px solid #e5edf2;border-radius:8px;padding:16px;overflow:auto;line-height:1.8}code{font:12px/1.85 'Cascadia Code',Consolas,monospace;background:#edf4f8;color:#346583;padding:2px 4px;border-radius:3px}pre code{padding:0;background:none;color:#355267}a{color:#1478ac}img{max-width:100%;height:auto;border-radius:7px}table{border-collapse:collapse;width:100%;font-size:12px;display:block;overflow:auto}td,th{padding:8px 12px;border:1px solid #dce8ef}th{background:#f1f7fa}hr{border:0;border-top:1px solid #e3ecf2;margin:25px 0}ul,ol{padding-left:24px}input{pointer-events:none}.empty{color:#9aabb6;font-family:serif}@media(max-width:420px){body{padding:24px 20px}h1{font-size:23px}}</style></head><body><header><p>DECWOVEH · LEARNING NOTES</p><h1>${escape(info.title)}</h1><small>${escape(String(info.data.date || '待填写日期').slice(0, 10))} &nbsp; · &nbsp; ${escape(categories.join(' / ') || '学习手记')}</small></header><article>${safe || '<p class="empty">写下第一行，让思考慢慢展开。</p>'}</article></body></html>`;
  return { ...info, html };
}
export function newTemplate(kind = 'study', now = new Date(), id = crypto.randomUUID().replaceAll('-', '').slice(0, 16)) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  const bodies = {
    study: '# 本次学习的主题\n\n> 用一句话，记录今天最重要的收获。\n\n## 为什么学习它\n\n写下遇到的问题，或者这次学习的起点。\n\n## 我的理解\n\n按自己的思路解释，配上例子会更清楚。\n\n```cpp\n// 在这里放入代码或示例\n```\n\n## 总结与回顾\n\n- 今天学会了什么？\n- 还有什么值得继续探索？\n',
    algorithm: '## 题目\n\n描述题目要求、输入输出和约束。\n\n### 示例\n\n```text\n输入：\n输出：\n```\n\n## 解题思路\n\n先写直觉，再解释算法为何正确。\n\n## 代码实现\n\n```cpp\nclass Solution {\npublic:\n    // 在这里编写解法\n};\n```\n\n## 复杂度分析\n\n- 时间复杂度：\n- 空间复杂度：\n\n## 易错点\n\n记录边界条件，以及这次踩过的坑。\n',
    daily: '## 今天想记录的事\n\n从一个小小的瞬间开始吧。\n\n## 一些想法\n\n慢慢写，不必一次就想清楚。\n\n> 留下一句想对未来的自己说的话。\n'
  };
  const category = kind === 'algorithm' ? '算法学习' : kind === 'daily' ? '生活随笔' : '学习笔记';
  return `---\ntitle: "${kind === 'algorithm' ? '一道题的思考' : kind === 'daily' ? '今天的小小记录' : '新的学习手记'}"\ndate: "${date}"\ncategories:\n  - ${category}\ntags:\n  - ${kind === 'algorithm' ? 'C++' : '学习记录'}\nabbrlink: "${id}"\ndescription: "用一两句话概括这篇文章"\n---\n\n${bodies[kind] || bodies.study}`;
}
