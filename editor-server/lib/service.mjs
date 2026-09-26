import { assertId, checkContent, EditorError, preparePublish, summary } from './content.mjs';

export function createService(store, github, config) {
  async function withLock(id, work) {
    const unlock = await store.lock(id);
    try { return await work(); }
    finally { await unlock().catch(() => {}); } // lease expires even after an interrupted invocation
  }
  function expectVersion(draft, version) {
    if (!Number.isInteger(version) || version < 0 || (draft?.version || 0) !== version) throw new EditorError(409, '草稿版本已变化。请先导出当前内容，再重新打开文章。');
  }
  return async function dispatch(input) {
    const { action } = input;
    if (action === 'list') {
      const [files, drafts] = await Promise.all([github.list(), store.list()]);
      const rows = new Map(files.map(file => [file.id, { ...file, title: file.title || file.id.replace(/\.md$/, ''), categories: file.categories || [], status: 'published', version: 0 }]));
      for (const draft of drafts) rows.set(draft.id, { ...rows.get(draft.id), id: draft.id, ...summary(draft.content, draft.id), status: rows.has(draft.id) ? 'changed' : 'draft', version: draft.version, updatedAt: draft.updated_at });
      return { articles: [...rows.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))), actionsUrl: `https://github.com/${config.repository}/actions` };
    }
    const id = assertId(input.id);
    if (action === 'get') {
      const [draft, published] = await Promise.all([store.get(id), github.get(id)]);
      if (!draft && !published) throw new EditorError(404, '文章不存在。');
      return { id, content: draft?.content ?? published.content, version: draft?.version || 0, baseSha: draft ? draft.base_sha : published.sha, publishedSha: published?.sha || null, status: published ? (draft ? 'changed' : 'published') : 'draft' };
    }
    if (!['save', 'publish', 'delete', 'discard'].includes(action)) throw new EditorError(400, '不支持的操作。');
    return withLock('repository-write', async () => {
      const draft = await store.get(id);
      expectVersion(draft, input.version);
      if (action === 'save') {
        if (input.baseSha != null && !/^[a-f0-9]{40}$/.test(input.baseSha)) throw new EditorError(400, '文章版本标识不合法。');
        const row = await store.save(id, checkContent(input.content), input.baseSha || null, input.version);
        return { version: row.version, updatedAt: row.updated_at };
      }
      if (action === 'discard') { await store.remove(id); return { discarded: true }; }
      const published = await github.get(id);
      if (action === 'publish') {
        if (!draft) throw new EditorError(400, '请先保存草稿。');
        const prepared = preparePublish(draft, published);
        // Idempotent recovery: if GitHub committed but the previous response was lost,
        // finishing the database cleanup must not create a second commit or lose data.
        if (published?.content !== prepared.content && (published?.sha || null) !== draft.base_sha) throw new EditorError(409, '线上文章已被其他操作修改。草稿已保留，请导出后核对，不会覆盖线上版本。');
        const result = published?.content === prepared.content ? { sha: published.sha } : await github.put(id, prepared.content, published?.sha);
        await store.remove(id);
        return { ...result, version: 0, content: prepared.content, url: `${config.blogUrl}/posts/${prepared.abbrlink}.html`, actionsUrl: `https://github.com/${config.repository}/actions`, submitted: true };
      }
      if (input.confirm !== id) throw new EditorError(400, '删除操作需要再次确认文章。');
      if ((published?.sha || null) !== (input.publishedSha || null)) throw new EditorError(409, '线上文章已变化，请重新打开后再删除。');
      const result = published ? await github.remove(id, published.sha) : {};
      await store.remove(id);
      return { deleted: true, ...result, actionsUrl: `https://github.com/${config.repository}/actions` };
    });
  };
}
