import schema from './settings-schema.cjs';
import { EditorError } from './content.mjs';
export async function handleSettings(input, store, github, config) {
  const decode = content => { try { return schema.validateSettings(JSON.parse(content)); } catch (error) { throw new EditorError(400, error.message); } };
  const currentResult = file => {
    if (!file) throw new EditorError(503, '网站设置文件尚未部署，请等待更新完成。');
    return { settings: decode(file.content), sha: file.sha };
  };
  if (input.action === 'settings.get') return currentResult(await github.getSettings());
  if (input.action !== 'settings.save') throw new EditorError(400, '不支持的网站设置操作。');
  if (!/^[a-f0-9]{40}$/.test(input.sha || '')) throw new EditorError(400, '请先读取网站设置，再保存。');
  let settings; try { settings = schema.validateSettings(input.settings); } catch (error) { throw new EditorError(400, error.message); }
  const unlock = await store.lock('repository-write');
  try {
    const current = currentResult(await github.getSettings());
    const content = JSON.stringify(settings, null, 2) + '\n';
    // Retry after a lost response is safe if the desired settings already reached GitHub.
    const unchanged = JSON.stringify(current.settings) === JSON.stringify(settings);
    if (!unchanged && current.sha !== input.sha) throw new EditorError(409, '网站设置已在另一页面更新。请复制保留你的修改，再重新读取并核对。');
    const result = unchanged ? { sha: current.sha } : await github.putSettings(content, current.sha);
    return { ...result, settings, submitted: !unchanged, actionsUrl: `https://github.com/${config.repository}/actions` };
  } finally { await unlock().catch(() => {}); }
}
