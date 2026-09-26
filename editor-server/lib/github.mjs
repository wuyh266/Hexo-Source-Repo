import { assertId, EditorError } from './content.mjs';
import { createHash } from 'node:crypto';
export function createGithub(config, fetcher = fetch) {
  const root = `https://api.github.com/repos/${config.repository}/contents/source/_posts`;
  async function request(id, method = 'GET', data, settingsFile = false) {
    const imageFile = typeof settingsFile === 'string' && /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(settingsFile) ? settingsFile : null;
    const target = imageFile ? `https://api.github.com/repos/${config.repository}/contents/source/img/uploads/${imageFile}` : settingsFile === true ? `https://api.github.com/repos/${config.repository}/contents/site-settings.json` : root + (id ? `/${encodeURIComponent(assertId(id))}` : '');
    const url = target + (method === 'GET' ? `?ref=${encodeURIComponent(config.branch)}` : '');
    const response = await fetcher(url, { method, signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.githubToken}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'Decwoveh-Editor' }, ...(data ? { body: JSON.stringify({ ...data, branch: config.branch }) } : {}) });
    if (response.status === 404 && method === 'GET' && id) return null;
    if ([409, 422].includes(response.status)) throw new EditorError(409, '仓库内容发生变化，请导出当前内容并重新打开文章后重试。');
    if (!response.ok) throw new EditorError(502, `GitHub 暂时不可用（${response.status}），请检查仓库和令牌权限。草稿不会被删除。`);
    return response.json();
  }
  return {
    async putImage(filename, base64) {
      if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(filename)) throw new EditorError(400, '图片文件名无效。');
      const existing = await request(filename, 'GET', undefined, filename);
      if (existing) {
        const bytes = Buffer.from(base64, 'base64');
        const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (existing.type !== 'file' || existing.sha !== sha) throw new EditorError(409, '同名图片内容不一致，请联系维护者。');
        return { sha: existing.sha };
      }
      const data = await request(filename, 'PUT', { message: `image: upload ${filename}`, content: base64 }, filename);
      return { sha: data.content.sha };
    },
    async getSettings() {
      const file = await request('site-settings.json', 'GET', undefined, true);
      if (!file) return null;
      if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 30000 || file.target || file.submodule_git_url) throw new EditorError(400, '网站设置文件无效。');
      return { sha: file.sha, content: Buffer.from(file.content, 'base64').toString('utf8') };
    },
    async putSettings(content, sha) {
      const data = await request('site-settings.json', 'PUT', { message: 'site: update website settings', content: Buffer.from(content).toString('base64'), sha }, true);
      return { sha: data.content.sha, commit: data.commit.sha };
    },
    async list() {
      const files = await request('');
      if (!Array.isArray(files) || files.length >= 1000) throw new EditorError(502, '文章目录超过当前编辑器支持的 999 个文件，请联系维护者。');
      return files.filter(file => file.type === 'file' && file.name.endsWith('.md')).map(file => ({ id: file.name, sha: file.sha }));
    },
    async get(id) {
      const file = await request(id);
      if (!file) return null;
      if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 500000 || file.submodule_git_url || file.target) throw new EditorError(400, '该文章不是可编辑的普通 Markdown 文件，或超过 500 KB。');
      return { id, sha: file.sha, content: Buffer.from(file.content, 'base64').toString('utf8') };
    },
    async put(id, content, sha) {
      const data = await request(id, 'PUT', { message: `post: ${sha ? 'update' : 'publish'} ${id}`, content: Buffer.from(content).toString('base64'), ...(sha ? { sha } : {}) });
      return { sha: data.content.sha, commit: data.commit.sha };
    },
    async remove(id, sha) {
      const data = await request(id, 'DELETE', { message: `post: delete ${id}`, sha });
      return { commit: data.commit.sha };
    }
  };
}
