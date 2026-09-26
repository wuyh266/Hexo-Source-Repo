import yaml from 'js-yaml';

export class EditorError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function assertId(id) {
  if (typeof id !== 'string' || !/^[^./\\\x00-\x1f][^/\\\x00-\x1f]*\.md$/u.test(id) || Buffer.byteLength(id) > 220 || id.includes('..')) {
    throw new EditorError(400, '文章文件名不合法。');
  }
  return id;
}
export function checkContent(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 500000) throw new EditorError(400, '文章最大支持 500 KB，请使用图片链接，不要粘贴图片数据。');
  return content.replace(/\r\n/g, '\n');
}
export function splitContent(content) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content);
  if (!match) throw new EditorError(400, '请保留文章开头的两行 --- 和中间的文章信息。');
  let data;
  try { data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA }); }
  catch { throw new EditorError(400, '文章信息格式有误，请检查冒号、缩进及引号。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new EditorError(400, '文章信息应为 title、date 等字段。');
  return { data, body: content.slice(match[0].length) };
}
export function summary(content, fallback) {
  try {
    const { data } = splitContent(content);
    return {
      title: typeof data.title === 'string' ? data.title : fallback,
      categories: Array.isArray(data.categories) ? data.categories.flat().filter(v => typeof v === 'string').slice(0, 5) : [],
      date: typeof data.date === 'string' ? data.date : ''
    };
  } catch { return { title: fallback, categories: [], date: '' }; }
}
export function preparePublish(draft, existing) {
  const { data, body } = splitContent(checkContent(draft.content));
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 200) throw new EditorError(400, '请填写 1–200 字的文章标题。');
  if (!body.trim()) throw new EditorError(400, '文章正文不能为空。');
  if (!data.date || Number.isNaN(Date.parse(String(data.date)))) throw new EditorError(400, '请填写正确的 date，例如 2026-09-25 12:00:00。');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(data.abbrlink ?? ''))) throw new EditorError(400, '请保留模板中的 abbrlink（文章永久地址）。');
  if (data.permalink != null || data.path != null || data.slug != null || data.published === false) throw new EditorError(400, '发布时不能设置 permalink、path、slug 或 published: false。');
  for (const key of ['categories', 'tags']) {
    if (data[key] != null && (!Array.isArray(data[key]) || data[key].flat().some(v => typeof v !== 'string'))) throw new EditorError(400, `${key} 请使用模板中的列表格式。`);
  }
  if (existing) {
    const old = splitContent(existing.content).data;
    if (String(old.abbrlink) !== String(data.abbrlink)) throw new EditorError(400, '已发布文章的 abbrlink 不能修改，以免旧链接失效。');
  } else {
    const generated = /^note-([a-f0-9-]{36})\.md$/.exec(draft.id);
    if (!generated || String(data.abbrlink) !== generated[1].replaceAll('-', '')) throw new EditorError(400, '新文章请保留系统生成的 abbrlink，不要复制其他文章的永久地址。');
  }
  data.layout = 'post';
  data.updated = new Date(draft.updated_at).toISOString();
  return { content: `---\n${yaml.dump(data, { schema: yaml.JSON_SCHEMA, lineWidth: -1, noRefs: true })}---\n${body}`, abbrlink: String(data.abbrlink) };
}
