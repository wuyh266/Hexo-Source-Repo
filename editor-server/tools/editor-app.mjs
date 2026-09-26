import { readMarkdown, renderPreview, newTemplate } from './preview.mjs';
import { mountSettings } from './settings-app.mjs';
import { compareArticlesNewestFirst } from '../lib/article-order.mjs';

const $ = selector => document.querySelector(selector);
// The credential destination is fixed at build time, never read from browser storage or URL parameters.
const EDITOR_API = 'https://blog-editor-pied.vercel.app';
const state = { token: '', offline: false, articles: [], current: null, saved: '', filter: 'all', busy: false, revision: 0 };
let previewTimer, saveTimer, toastTimer;
const labels = { draft: '草稿', published: '已发布', changed: '有未发布修改' };
const dirty = () => state.current && $('#markdown').value !== state.saved;
function notify(message, error = false) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; $('#toast').classList.toggle('error', error);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 9000 : 5000);
}
function confirmAction(title, message, label = '确认') {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title; $('#confirm-description').textContent = message; $('#confirm-yes').textContent = label;
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }); dialog.showModal(); });
}
async function request(action, data = {}) {
  let response;
  try { response = await fetch(`${EDITOR_API}/api/editor`, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }, body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(65000) }); }
  catch { throw new Error('连接失败或响应超时。内容仍留在编辑页；可先导出备份。发布超时请先核对 GitHub 构建再重试。'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('后台未返回有效数据，请检查网址及 Vercel 部署访问保护设置。'); }
  if (!response.ok) {
    if (response.status === 401 && action !== 'login') { state.token = ''; showLogin(true); }
    throw new Error(result.error || `请求失败（${response.status}）`);
  }
  return result;
}
async function run(work) {
  if (state.busy) return;
  state.busy = true; document.body.classList.add('busy');
  const controls = [...document.querySelectorAll('#save-post,#publish-post,#delete-post,#discard-post,#new-post,#refresh-list,#back-library,#apply-template,#logout,#mobile-logout,#login-button,#website-settings,#mobile-settings,#settings-save,#settings-reload')];
  controls.forEach(button => { button.dataset.wasDisabled = String(button.disabled); button.disabled = true; });
  try { await work(); } catch (error) { notify(error.message, true); }
  finally { state.busy = false; document.body.classList.remove('busy'); controls.forEach(button => { button.disabled = button.dataset.wasDisabled === 'true'; }); $('#apply-template').disabled = !!state.current?.publishedSha; updateStatus(); }
}
function updateStatus(message) {
  if (!state.current) return;
  const changed = dirty();
  $('#save-status').textContent = message || (state.offline ? '离线试写 · 未保存到云端' : changed ? '有未保存修改' : state.current.version > 0 ? '草稿已保存 · 尚未发布' : state.current.publishedSha ? '已载入线上版本' : '新文章 · 尚未保存');
  $('#save-status').classList.toggle('unsaved', changed || state.offline);
  if (!state.busy) { $('#save-post').disabled = state.offline; $('#publish-post').disabled = state.offline; }
  $('#discard-post').hidden = !(state.current.publishedSha && state.current.version > 0);
}
function updatePreview() {
  const text = $('#markdown').value;
  const rendered = renderPreview(text, window);
  $('#preview').srcdoc = rendered.html;
  $('#editing-title').textContent = rendered.title;
  $('#preview-warning').hidden = !rendered.warning;
  $('#preview-warning').textContent = rendered.warning;
  $('#word-count').textContent = `${text.replace(/\s/g, '').length.toLocaleString()} 字符 · ${text.split('\n').length} 行`;
  updateStatus();
}
function changed() {
  state.revision++; clearTimeout(previewTimer); clearTimeout(saveTimer); updateStatus();
  previewTimer = setTimeout(updatePreview, 180);
  if ($('#autosave').checked && !state.offline && state.token) saveTimer = setTimeout(() => { if (!state.busy && dirty()) run(() => saveDraft()); }, 3000);
}
function showLogin(preserve = false) {
  clearTimeout(saveTimer); $('#login-view').hidden = false; $('#workspace').hidden = true;
  $('#password').value = ''; if (preserve) $('#login-error').textContent = '登录已过期。重新登录后可继续编辑，当前内容暂存于本页，切勿刷新。';
}
function enterWorkspace() {
  $('#login-view').hidden = true; $('#workspace').hidden = false; $('#offline-notice').hidden = !state.offline;
  $('#connection-status').textContent = state.offline ? '离线体验' : '已连接写作服务';
}
function renderList() {
  const count = { all: state.articles.length, draft: state.articles.filter(a => a.status !== 'published').length, published: state.articles.filter(a => a.status !== 'draft').length };
  for (const key of Object.keys(count)) { $(`#count-${key}`).textContent = count[key]; $(`#stat-${key}`).textContent = String(count[key]).padStart(2, '0'); }
  $('#list-title').textContent = { all: '全部文章', draft: '草稿箱', published: '已发布文章' }[state.filter];
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === state.filter));
  const needle = $('#search').value.trim().toLowerCase();
  const list = state.articles
    .filter(a => (state.filter === 'all' || (state.filter === 'draft' ? a.status !== 'published' : a.status !== 'draft')) && `${a.title} ${a.id} ${(a.categories || []).join(' ')}`.toLowerCase().includes(needle))
    .sort(compareArticlesNewestFirst);
  const container = $('#article-list'); container.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const title = document.createElement('strong'); title.textContent = needle ? '还没找到这篇手记' : '下一篇，从一个想法开始';
    const note = document.createElement('p'); note.textContent = needle ? '换个关键词再找找。' : '点击「新建文章」，模板已经为你准备好了。'; empty.append(title, note); container.append(empty); return;
  }
  for (const item of list) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'article-row'; row.setAttribute('aria-label', `编辑：${item.title}`);
    const details = document.createElement('span'), title = document.createElement('strong'), meta = document.createElement('small');
    title.textContent = item.title; meta.textContent = `${(item.categories || []).join(' / ') || 'Markdown 手记'} · ${item.id}`; details.append(title, meta);
    const status = document.createElement('span'); status.className = `badge ${item.status}`; status.textContent = labels[item.status];
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗'; row.append(details, status, arrow);
    row.addEventListener('click', () => run(() => openPost(item.id))); container.append(row);
  }
}
async function refreshLibrary() {
  if (!state.offline) {
    const rememberedDates = new Map(state.articles.map(article => [article.id, article.date]).filter(([, date]) => date));
    const data = await request('list');
    state.articles = data.articles.map(article => ({ ...article, date: article.date || rememberedDates.get(article.id) || '' }));
    // Public metadata is only a title hint; GitHub remains authoritative for files and versions.
    try {
      const meta = await fetch('/editor/published.json', { cache: 'no-store' }).then(r => r.json());
      state.articles = state.articles.map(article => article.status === 'published' && meta[article.id] ? { ...article, title: meta[article.id].title, categories: meta[article.id].categories, date: meta[article.id].date || article.date } : article);
    } catch { /* filenames remain usable if the static metadata has not been deployed */ }
  }
  renderList();
}
async function canLeave() {
  return (!dirty() && !websiteSettings.isDirty()) || await confirmAction('离开当前页面？', '还有未保存的修改。请取消并保存，或复制保留当前内容。直接离开会丢弃这些修改。', '丢弃修改并离开');
}
function showEditor(article) {
  websiteSettings.hide();
  clearTimeout(saveTimer); clearTimeout(previewTimer); state.current = article; state.saved = article.content; state.revision++;
  $('#markdown').value = article.content; $('#file-label').textContent = `source/_posts/${article.id}`;
  $('#library-view').hidden = true; $('#editor-view').hidden = false; $('#page-label').textContent = '撰写手记'; $('#publish-notice').hidden = true;
  $('#apply-template').disabled = !!article.publishedSha; updatePreview(); window.scrollTo(0, 0);
}
async function openPost(id) { if (!await canLeave()) return; const article = await request('get', { id }); showEditor(article); }
async function saveDraft() {
  if (!state.current || state.offline) { notify('离线内容请用「导出 Markdown」保存。'); return; }
  clearTimeout(saveTimer);
  const content = $('#markdown').value;
  updateStatus('正在保存草稿…');
  const data = await request('save', { id: state.current.id, content, version: state.current.version, baseSha: state.current.baseSha });
  state.current.version = data.version; state.current.content = content; state.saved = content;
  const parsed = readMarkdown(content);
  const row = { id: state.current.id, title: parsed.title, categories: Array.isArray(parsed.data.categories) ? parsed.data.categories.flat() : [], date: typeof parsed.data.date === 'string' ? parsed.data.date : '', status: state.current.publishedSha ? 'changed' : 'draft', version: data.version, updatedAt: data.updatedAt };
  state.articles = [row, ...state.articles.filter(item => item.id !== row.id)]; renderList(); updateStatus();
  if (dirty() && $('#autosave').checked) saveTimer = setTimeout(() => { if (!state.busy) run(() => saveDraft()); }, 3000);
}
function showPublishNotice(message, actionsUrl, url) {
  const notice = $('#publish-notice'); notice.replaceChildren(document.createTextNode(message));
  for (const [label, href] of [['查看构建进度', actionsUrl], ['打开文章', url]]) { if (!href) continue; const link = document.createElement('a'); link.textContent = label; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; notice.append(link); }
  notice.hidden = false;
}

$('#login-form').addEventListener('submit', event => {
  event.preventDefault(); run(async () => {
    $('#login-error').textContent = ''; const password = $('#password').value;
    try { const data = await request('login', { password }); state.token = data.token; state.offline = false; $('#password').value = ''; enterWorkspace(); if (state.current) { $('#editor-view').hidden = false; $('#library-view').hidden = true; updateStatus(); } await refreshLibrary(); }
    catch (error) { $('#login-error').textContent = error.message; throw error; }
  });
});
$('#offline-button').addEventListener('click', async () => { if (!await canLeave()) return; websiteSettings.hide(); state.offline = true; state.token = ''; state.articles = []; state.current = null; enterWorkspace(); $('#library-view').hidden = false; $('#editor-view').hidden = true; renderList(); });
async function logout() {
  if (!await canLeave()) return; websiteSettings.hide(); clearTimeout(saveTimer); state.token = ''; state.current = null; state.articles = []; state.saved = ''; $('#markdown').value = ''; $('#preview').srcdoc = ''; $('#article-list').replaceChildren(); $('#login-error').textContent = ''; showLogin();
}
$('#logout').addEventListener('click', logout); $('#mobile-logout').addEventListener('click', logout);
$('#new-post').addEventListener('click', () => run(async () => {
  if (!await canLeave()) return;
  const uuid = crypto.randomUUID(), id = `note-${uuid}.md`; showEditor({ id, content: newTemplate('study', new Date(), uuid.replaceAll('-', '')), version: 0, baseSha: null, publishedSha: null }); state.saved = ''; updateStatus();
}));
$('#back-library').addEventListener('click', () => run(async () => {
  if (websiteSettings.isOpen()) { if (!await canLeave()) return; websiteSettings.hide(); }
  if (!await canLeave()) return; clearTimeout(saveTimer); state.current = null; $('#editor-view').hidden = true; $('#library-view').hidden = false; $('#page-label').textContent = '文章管理'; document.body.classList.remove('focus-mode'); $('#focus-toggle').setAttribute('aria-pressed', 'false'); await refreshLibrary();
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => run(async () => {
  if (!await canLeave()) return; websiteSettings.hide(); clearTimeout(saveTimer); state.current = null; state.filter = button.dataset.filter; $('#editor-view').hidden = true; $('#library-view').hidden = false; $('#page-label').textContent = '文章管理'; renderList();
})));
$('#search').addEventListener('input', renderList); $('#refresh-list').addEventListener('click', () => run(refreshLibrary));
$('#markdown').addEventListener('input', changed);
$('#autosave').addEventListener('change', () => { clearTimeout(saveTimer); if ($('#autosave').checked && dirty()) changed(); });
$('#save-post').addEventListener('click', () => run(async () => { await saveDraft(); if (!dirty()) notify('草稿已保存，尚未发布。'); }));
$('#publish-post').addEventListener('click', () => run(async () => {
  clearTimeout(saveTimer);
  if (!await confirmAction('把这篇文章分享出去？', '发布将把当前内容写入 GitHub 公开仓库。确认没有密码或私密信息后继续。网站需要等待构建完成才会更新。', '确认发布')) return;
  await saveDraft();
  if (dirty()) throw new Error('保存期间又有新修改，请稍后再点击发布。');
  const revision = state.revision;
  updateStatus('正在提交发布…');
  const result = await request('publish', { id: state.current.id, version: state.current.version });
  state.current.version = 0; state.current.baseSha = result.sha; state.current.publishedSha = result.sha; state.current.content = result.content;
  if (revision === state.revision) { $('#markdown').value = result.content; state.saved = result.content; updatePreview(); }
  else { state.saved = result.content; updateStatus('已提交旧版本；新的修改尚未保存'); }
  showPublishNotice('已提交发布，等待 GitHub 构建完成。', result.actionsUrl, result.url);
  await refreshLibrary(); notify('发布已提交。可通过「查看构建进度」确认是否上线。');
}));
$('#delete-post').addEventListener('click', () => run(async () => {
  const published = state.current.publishedSha;
  if (!await confirmAction(published ? '删除已发布文章？' : '删除这份草稿？', published ? '将删除线上文章及对应草稿。网站构建后生效，历史已发布内容可从 GitHub 提交记录恢复。当前未保存修改也将丢弃。' : '草稿将永久删除，未发布内容不能从 GitHub 恢复。建议先导出 Markdown。', '确认删除')) return;
  clearTimeout(saveTimer);
  let result;
  if (!state.offline) result = await request('delete', { id: state.current.id, version: state.current.version, publishedSha: published, confirm: state.current.id });
  state.articles = state.articles.filter(a => a.id !== state.current.id); state.current = null; $('#editor-view').hidden = true; $('#library-view').hidden = false; $('#page-label').textContent = '文章管理'; renderList();
  if (published) showPublishNotice('删除已提交，等待网站构建生效。', result.actionsUrl); else notify('草稿已删除，无法恢复（除非已导出）。');
}));
$('#discard-post').addEventListener('click', () => run(async () => {
  if (!await confirmAction('放弃未发布修改？', '这将永久删除这篇文章的云端草稿及当前未保存修改，重新载入已发布版本。线上文章不受影响。', '放弃修改')) return;
  clearTimeout(saveTimer); const id = state.current.id; await request('discard', { id, version: state.current.version }); state.saved = $('#markdown').value; await openPost(id); await refreshLibrary();
}));
$('#export-post').addEventListener('click', () => {
  const blob = new Blob([$('#markdown').value], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = state.current.id; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('已导出 Markdown。请查看浏览器下载记录。');
});
$('#apply-template').addEventListener('click', () => run(async () => {
  if (state.current.publishedSha) return;
  if (!await confirmAction('替换为新的文章模板？', '会替换当前编辑内容。已有文字请先导出备份。', '应用模板')) return;
  const info = readMarkdown($('#markdown').value); $('#markdown').value = newTemplate($('#template').value, new Date(), /^[\w-]+$/.test(String(info.data.abbrlink || '')) ? String(info.data.abbrlink) : undefined); changed(); updatePreview();
}));
$('#help-toggle').addEventListener('click', () => { const hidden = !$('#writing-guide').hidden; $('#writing-guide').hidden = hidden; $('#help-toggle').textContent = hidden ? '展开填写指引' : '收起填写指引'; $('#help-toggle').setAttribute('aria-expanded', String(!hidden)); });
$('#focus-toggle').addEventListener('click', () => { const on = document.body.classList.toggle('focus-mode'); $('#focus-toggle').setAttribute('aria-pressed', String(on)); $('#focus-toggle').textContent = on ? '退出专注' : '专注模式'; });
$('#show-write').addEventListener('click', () => { $('#writing-desk').classList.remove('preview-only'); $('#show-write').classList.add('active'); $('#show-preview').classList.remove('active'); });
$('#show-preview').addEventListener('click', () => { $('#writing-desk').classList.add('preview-only'); $('#show-preview').classList.add('active'); $('#show-write').classList.remove('active'); updatePreview(); });
const inserts = { heading: ['\n## ', '', '小节标题'], bold: ['**', '**', '重点内容'], italic: ['*', '*', '强调内容'], code: ['\n```cpp\n', '\n```\n', '// 代码'], link: ['[', '](https://example.com)', '链接文字'], image: ['![', '](https://example.com/image.jpg)', '图片说明'], list: ['\n- ', '', '列表内容'] };
document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => {
  const textarea = $('#markdown'), [prefix, suffix, placeholder] = inserts[button.dataset.insert]; const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) || placeholder;
  textarea.setRangeText(prefix + selected + suffix, textarea.selectionStart, textarea.selectionEnd, 'end'); textarea.focus(); changed();
}));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    if (websiteSettings.isOpen() && state.token) { event.preventDefault(); $('#settings-form').requestSubmit(); }
    else if (state.current) { event.preventDefault(); if (!state.token || state.offline) $('#export-post').click(); else run(() => saveDraft()); }
  }
});
window.addEventListener('beforeunload', event => { if (dirty() || websiteSettings.isDirty() || (state.offline && state.current)) { event.preventDefault(); event.returnValue = ''; } });
const websiteSettings = mountSettings({ request, run, canLeave, notify, isOffline: () => state.offline, showPublishNotice, onOpen: () => {
  clearTimeout(saveTimer); state.current = null; $('#library-view').hidden = true; $('#editor-view').hidden = true; $('#publish-notice').hidden = true; $('#page-label').textContent = '网站设置'; document.body.classList.remove('focus-mode');
} });
// Remove only the obsolete address preference; passwords, tokens and articles are never stored here.
try { localStorage.removeItem('decwoveh-editor-endpoint'); } catch {}
$('#login-button').disabled = false;
