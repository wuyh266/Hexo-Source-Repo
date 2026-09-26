import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = await readFile(new URL('../../source/editor/index.html', import.meta.url), 'utf8');
const bundle = await readFile(new URL('../../source/editor/app.js', import.meta.url), 'utf8');
const initialSettings = JSON.parse(await readFile(new URL('../../site-settings.json', import.meta.url), 'utf8'));
async function waitFor(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('UI condition timed out'); }
function setup(apiBase = '', seedLegacyEndpoint = false) {
  const messages = [], requests = [], drafts = new Map(), published = new Map(), metadata = {};
  let expire = false, failPublish = false;
  let websiteData = structuredClone(initialSettings), websiteSha = 'a'.repeat(40);
  const vc = new VirtualConsole(); vc.on('jsdomError', error => messages.push(error.message));
  const dom = new JSDOM(html, { url: 'https://example.com/editor/', runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window, $ = selector => w.document.querySelector(selector);
  w.scrollTo = () => {}; w.AbortSignal = AbortSignal; w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; this.returnValue = ''; };
  w.HTMLDialogElement.prototype.close = function(value) { this.returnValue = value; this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.fetch = async (url, options = {}) => {
    if (url === '/editor/config.json') return { json: async () => ({ apiBase }) };
    if (url === '/editor/published.json') return { json: async () => structuredClone(metadata) };
    const input = JSON.parse(options.body); requests.push({ url, input, options });
    let status = 200, result;
    if (input.action === 'login') result = { token: 'test-owner-token' };
    else if (expire || options.headers.Authorization !== 'Bearer test-owner-token') { status = 401; result = { error: '登录过期' }; }
    else if (input.action === 'settings.get') result = { settings: structuredClone(websiteData), sha: websiteSha };
    else if (input.action === 'settings.save') { websiteData = structuredClone(input.settings); websiteSha = 'b'.repeat(40); result = { settings: structuredClone(websiteData), sha: websiteSha, submitted: true, actionsUrl: 'https://github.com/owner/blog/actions' }; }
    else if (input.action === 'list') {
      const all = new Map([...published].map(([id, p]) => [id, { id, title: id, status: 'published', version: 0, sha: p.sha }]));
      for (const [id, draft] of drafts) {
        const title = /^title:\s*(.+)$/m.exec(draft.content)?.[1] || '新的学习手记';
        const date = /^date:\s*(.+)$/m.exec(draft.content)?.[1] || '';
        all.set(id, { id, title, date, status: published.has(id) ? 'changed' : 'draft', version: draft.version });
      }
      result = { articles: [...all.values()] };
    } else if (input.action === 'save') { const version = (drafts.get(input.id)?.version || 0) + 1; drafts.set(input.id, { ...input, version }); result = { version, updatedAt: new Date().toISOString() }; }
    else if (input.action === 'get') { const draft = drafts.get(input.id), online = published.get(input.id); result = { id: input.id, content: draft?.content || online.content, baseSha: online?.sha || null, publishedSha: online?.sha || null, version: draft?.version || 0 }; }
    else if (input.action === 'publish') {
      if (failPublish) { status = 503; result = { error: 'GitHub 暂不可用，草稿已保留。' }; }
      else { const draft = drafts.get(input.id); const data = { content: draft.content, sha: 'a'.repeat(40) }; published.set(input.id, data); drafts.delete(input.id); result = { ...data, submitted: true, url: 'https://example.com/posts/test.html', actionsUrl: 'https://github.com/owner/blog/actions' }; }
    } else if (input.action === 'delete') { drafts.delete(input.id); published.delete(input.id); result = { deleted: true, actionsUrl: 'https://github.com/owner/blog/actions' }; }
    else if (input.action === 'discard') { drafts.delete(input.id); result = { discarded: true }; }
    return { ok: status === 200, status, json: async () => result };
  };
  if (seedLegacyEndpoint) {
    w.localStorage.setItem('decwoveh-editor-endpoint', 'https://attacker.example');
    w.localStorage.setItem('unrelated-preference', 'keep');
    w.history.replaceState(null, '', '/editor/?apiBase=https://attacker.example');
  }
  w.eval(bundle);
  const click = selector => $(selector).click();
  const type = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const confirm = async () => { await waitFor(() => $('#confirm-dialog').open); $('#confirm-dialog').close('confirm'); };
  const idle = () => waitFor(() => !w.document.body.classList.contains('busy'));
  const login = async () => { await waitFor(() => !$('#login-button').disabled); type('#password', 'test-password'); $('#login-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await waitFor(() => !$('#workspace').hidden); await idle(); };
  return { dom, w, $, click, type, confirm, idle, login, requests, drafts, published, metadata, messages, expire() { expire = true; }, recover() { expire = false; }, failPublish() { failPublish = true; } };
}
test('offline experience shows explicit limits, template, safe preview and mobile tabs', async () => {
  const f = setup(); try {
    assert.equal(f.$('#connection-details'), null);
    assert.equal(f.$('#login-button').disabled, false);
    f.click('#offline-button'); await waitFor(() => !f.$('#workspace').hidden);
    f.click('#new-post'); await f.idle();
    assert.ok(f.$('#markdown').value.includes('categories:'));
    assert.ok(f.$('#preview').srcdoc.includes('新的学习手记'));
    assert.equal(f.$('#save-post').disabled, true); assert.equal(f.$('#publish-post').disabled, true);
    assert.equal(f.$('#offline-notice').hidden, false);
    f.type('#markdown', f.$('#markdown').value + '\n## 新的想法');
    await waitFor(() => f.$('#preview').srcdoc.includes('新的想法'));
    f.click('#show-preview'); assert.ok(f.$('#writing-desk').classList.contains('preview-only'));
    f.click('#show-write'); assert.ok(!f.$('#writing-desk').classList.contains('preview-only'));
    f.click('#back-library'); await f.confirm(); await f.idle(); assert.equal(f.$('#library-view').hidden, false);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.messages, []);
  } finally { f.dom.window.close(); }
});
test('logged-in UI performs create, draft, publish, reload, edit, discard and delete', async () => {
  const f = setup('https://editor.example.com'); try {
    await f.login(); f.click('#new-post'); await f.idle();
    f.click('#save-post'); await f.idle(); assert.equal(f.drafts.size, 1); assert.match(f.$('#save-status').textContent, /草稿已保存/);
    f.click('#publish-post'); await f.confirm(); await f.idle(); assert.equal(f.published.size, 1); assert.equal(f.drafts.size, 0); assert.equal(f.$('#publish-notice').hidden, false); assert.match(f.$('#publish-notice').textContent, /等待 GitHub 构建/);
    f.click('#back-library'); await f.idle(); f.click('.article-row'); await f.idle();
    assert.equal(f.$('#apply-template').disabled, true);
    f.type('#markdown', f.$('#markdown').value + '\n新草稿'); f.click('#save-post'); await f.idle(); assert.equal(f.$('#discard-post').hidden, false);
    f.click('#discard-post'); await f.confirm(); await f.idle(); assert.equal(f.drafts.size, 0); assert.ok(!f.$('#markdown').value.includes('新草稿'));
    f.click('#delete-post'); await f.confirm(); await f.idle(); assert.equal(f.published.size, 0); assert.equal(f.$('#library-view').hidden, false);
    assert.ok(f.requests.filter(r => r.input.action !== 'login').every(r => r.options.headers.Authorization === 'Bearer test-owner-token'));
    assert.equal(f.w.localStorage.getItem('token'), null); assert.equal(f.w.localStorage.length, 0); assert.deepEqual(f.messages, []);
  } finally { f.dom.window.close(); }
});
test('session expiry preserves unsaved text and re-login restores writing', async () => {
  const f = setup('https://editor.example.com'); try {
    await f.login(); f.click('#new-post'); await f.idle(); const raw = f.$('#markdown').value + '\n不能丢失的内容'; f.type('#markdown', raw);
    f.expire(); f.click('#save-post'); await f.idle(); assert.equal(f.$('#login-view').hidden, false); assert.equal(f.$('#markdown').value, raw);
    f.recover(); await f.login(); assert.equal(f.$('#markdown').value, raw); f.click('#save-post'); await f.idle(); assert.equal([...f.drafts.values()][0].content, raw);
  } finally { f.dom.window.close(); }
});
test('failed publishing keeps recoverable draft and does not announce success', async () => {
  const f = setup('https://editor.example.com'); try {
    await f.login(); f.click('#new-post'); await f.idle(); f.failPublish(); f.click('#publish-post'); await f.confirm(); await f.idle();
    assert.equal(f.drafts.size, 1); assert.equal(f.published.size, 0); assert.equal(f.$('#publish-notice').hidden, true); assert.match(f.$('#toast').textContent, /草稿已保留/);
  } finally { f.dom.window.close(); }
});
test('credentials use only fixed production origin despite legacy storage, config or URL overrides', async () => {
  const f = setup('https://attacker.example', true); try {
    assert.equal(f.$('#endpoint'), null);
    assert.equal(f.$('#connect-button'), null);
    assert.equal(f.w.localStorage.getItem('decwoveh-editor-endpoint'), null);
    assert.equal(f.w.localStorage.getItem('unrelated-preference'), 'keep');
    await f.login();
    assert.ok(f.requests.some(r => r.input.action === 'login'));
    assert.ok(f.requests.every(r => r.url === 'https://blog-editor-pied.vercel.app/api/editor' && r.options.redirect === 'error'));
    const policy = f.$('meta[http-equiv="Content-Security-Policy"]').content;
    assert.equal(policy.split(';').map(v => v.trim()).find(v => v.startsWith('connect-src ')), "connect-src 'self' https://blog-editor-pied.vercel.app");
    assert.deepEqual(f.messages, []);
  } finally { f.dom.window.close(); }
});
test('article library sorts drafts and published posts by creation date, newest first', async () => {
  const f = setup(); try {
    f.published.set('older.md', { sha: 'a'.repeat(40), content: 'older' });
    f.published.set('middle.md', { sha: 'b'.repeat(40), content: 'middle' });
    f.metadata['older.md'] = { title: '最早发布', categories: [], date: '2025-01-01 08:00:00' };
    f.metadata['middle.md'] = { title: '中间发布', categories: [], date: '2026-05-01 08:00:00' };
    f.drafts.set('newest.md', { version: 4, updatedAt: '2020-01-01T00:00:00Z', content: '---\ntitle: 最新草稿\ndate: 2026-09-26 09:30:00\n---\n正文' });
    await f.login();
    assert.deepEqual([...f.w.document.querySelectorAll('.article-row strong')].map(node => node.textContent), ['最新草稿', '中间发布', '最早发布']);
    f.type('#search', '发布');
    assert.deepEqual([...f.w.document.querySelectorAll('.article-row strong')].map(node => node.textContent), ['中间发布', '最早发布']);
    assert.deepEqual(f.messages, []);
  } finally { f.dom.window.close(); }
});
test('website settings edit, preview, publish, reload and navigate back to articles', async () => {
  const f = setup(); try {
    await f.login(); f.click('#website-settings'); await f.idle();
    assert.equal(f.$('#settings-view').hidden, false);
    assert.equal(f.$('#library-view').hidden, true);
    f.type('[name=announcement]', '新的公告\n欢迎交流');
    f.type('[name=title]', '新名称');
    assert.equal(f.$('#settings-preview-announcement-text').textContent, '新的公告\n欢迎交流');
    assert.match(f.$('#settings-status').textContent, /未发布/);
    f.$('#settings-form').dispatchEvent(new f.w.Event('submit', { cancelable: true })); await f.idle();
    assert.equal(f.requests.find(r => r.input.action === 'settings.save').input.settings.title, '新名称');
    assert.equal(f.$('#publish-notice').hidden, false);
    f.click('[data-filter=all]'); await f.idle(); assert.equal(f.$('#settings-view').hidden, true);
    f.click('#mobile-settings'); await f.idle(); assert.equal(f.$('[name=announcement]').value, '新的公告\n欢迎交流');
    f.type('[name=description]', '尚未保存');
    f.click('[data-filter=all]'); await f.confirm(); await f.idle();
    assert.equal(f.$('#library-view').hidden, false); assert.equal(f.$('#settings-view').hidden, true);
    assert.deepEqual(f.messages, []);
  } finally { f.dom.window.close(); }
});
test('settings survive session expiry and are unavailable in offline mode', async () => {
  const f = setup(); try {
    f.click('#offline-button'); await waitFor(() => !f.$('#workspace').hidden);
    f.click('#website-settings'); await f.idle(); assert.equal(f.$('#settings-view').hidden, true);
    f.click('#logout'); await waitFor(() => !f.$('#login-view').hidden);
    await f.login(); f.click('#website-settings'); await f.idle(); f.type('[name=announcement]', '过期也保留');
    f.expire(); f.$('#settings-form').dispatchEvent(new f.w.Event('submit', { cancelable: true })); await f.idle();
    assert.equal(f.$('#login-view').hidden, false);
    f.recover(); await f.login(); assert.equal(f.$('[name=announcement]').value, '过期也保留');
    f.$('#settings-form').dispatchEvent(new f.w.Event('submit', { cancelable: true })); await f.idle();
    assert.equal(f.$('#settings-status').textContent, '设置已保存');
  } finally { f.dom.window.close(); }
});
