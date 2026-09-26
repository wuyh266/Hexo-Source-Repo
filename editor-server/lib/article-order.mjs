export function articleTimestamp(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return Number.NEGATIVE_INFINITY;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const localDateTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text);
  const normalized = dateOnly
    ? `${text}T00:00:00+08:00`
    : localDateTime ? `${text.replace(' ', 'T')}+08:00` : text;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function compareArticlesNewestFirst(a, b) {
  const aTimestamp = articleTimestamp(a?.date);
  const bTimestamp = articleTimestamp(b?.date);
  if (aTimestamp !== bTimestamp) return bTimestamp > aTimestamp ? 1 : -1;
  return String(a?.id || '').localeCompare(String(b?.id || ''), 'zh-CN');
}
