import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertId, checkContent, EditorError, preparePublish, splitContent } from '../lib/content.mjs';
import { readConfig, authenticate, issueToken, correctPassword } from '../lib/auth.mjs';
import { createService } from '../lib/service.mjs';
import { createHandler } from '../api/editor.js';
import { createGithub } from '../lib/github.mjs';
import { newTemplate, renderPreview } from '../tools/preview.mjs';
import { JSDOM } from 'jsdom';

const config = { password: 'a-private-test-password', secret: 'a-test-secret-at-least-thirty-two-characters', repository: 'owner/blog', branch: 'main', blogUrl: 'https://example.com', origins: ['https://example.com'], githubToken: 'test-token' };
function fixture() {
  const drafts = new Map(), published = new Map(), locks = new Set();
  let commits = 0, failPut = false, failCleanup = false;
  const store = {
    async list() { return [...drafts.values()]; },
    async get(id) { return drafts.get(id) || null; },
    async save(id, content, baseSha, version) { if ((drafts.get(id)?.version || 0) !== version) throw new EditorError(409, 'conflict'); const row = { id, content, base_sha: drafts.has(id) ? drafts.get(id).base_sha : baseSha, version: version + 1, updated_at: '2026-09-25T12:00:00Z' }; drafts.set(id, row); return row; },
    async remove(id) { if (failCleanup) { failCleanup = false; throw Error('database unavailable'); } drafts.delete(id); },
    async lock(id) { if (locks.has(id)) throw new EditorError(409, 'locked'); locks.add(id); return async () => locks.delete(id); },
    async limit() {}
  };
  const github = {
    async list() { return [...published.values()].map(({ id, sha }) => ({ id, sha })); },
    async get(id) { return published.get(id) || null; },
    async put(id, content, sha) { if (failPut) throw Error('GitHub unavailable'); assert.equal(published.get(id)?.sha, sha); commits++; const next = String(commits).padStart(40, 'a'); published.set(id, { id, content, sha: next }); return { sha: next, commit: `commit-${commits}` }; },
    async remove(id, sha) { assert.equal(published.get(id).sha, sha); published.delete(id); commits++; return { commit: `commit-${commits}` }; }
  };
  return { service: createService(store, github, config), store, github, drafts, published, locks, get commits() { return commits; }, failPut() { failPut = true; }, failCleanup() { failCleanup = true; } };
}
function newPost() { const uuid = randomUUID(); return { id: `note-${uuid}.md`, content: newTemplate('algorithm', new Date('2026-09-25T12:00:00Z'), uuid.replaceAll('-', '')), version: 0, baseSha: null }; }
async function saved(f, post = newPost()) { const result = await f.service({ action: 'save', ...post }); return { ...post, version: result.version }; }
test('filename protection rejects traversal, hidden files and non-Markdown targets', () => {
  for (const id of ['../_config.yml', 'a/../b.md', '.secret.md', 'a\\b.md', 'note.txt', 'a\0.md', 'a..md']) assert.throws(() => assertId(id));
  assert.equal(assertId('我的第一篇blog.md'), '我的第一篇blog.md');
});
test('article size limits and newline normalization', () => { assert.equal(checkContent('a\r\nb'), 'a\nb'); assert.throws(() => checkContent('文'.repeat(170000))); });
test('missing or example credentials fail closed', () => { assert.throws(() => readConfig({})); assert.throws(() => readConfig({ EDITOR_PASSWORD: 'replace-with-long-password', SESSION_SECRET: config.secret, DATABASE_URL: 'url', GITHUB_TOKEN: 'token', GITHUB_REPOSITORY: config.repository, ALLOWED_ORIGINS: config.origins[0] })); });
test('password checks do not accept arrays or truncated strings', () => { assert.equal(correctPassword(config.password, config), true); assert.equal(correctPassword(config.password.slice(1), config), false); assert.equal(correctPassword([config.password], config), false); });
test('signed login tokens reject tampering, expiry and malformed claims', () => {
  const now = Date.now(), token = issueToken(config, now); assert.doesNotThrow(() => authenticate(`Bearer ${token}`, config, now));
  for (const value of [null, 'Bearer x.y', `Bearer ${token}x`, `Bearer ${token}.extra`]) assert.throws(() => authenticate(value, config));
  assert.throws(() => authenticate(`Bearer ${token}`, config, now + 14401000));
  assert.throws(() => authenticate(`Bearer ${token}`, { ...config, secret: 'different' }, now));
});
test('private draft saves never write to GitHub', async () => { const f = fixture(), post = await saved(f); assert.equal(f.drafts.size, 1); assert.equal(f.published.size, 0); assert.equal(f.commits, 0); assert.equal((await f.service({ action: 'get', id: post.id })).content, post.content); });
test('draft can retain incomplete YAML but publish rejects it', async () => { const f = fixture(), post = await saved(f, { ...newPost(), content: 'unfinished note' }); await assert.rejects(f.service({ action: 'publish', id: post.id, version: post.version }), { status: 400 }); assert.equal(f.drafts.size, 1); });
test('new draft to publish round trip', async () => { const f = fixture(), post = await saved(f); const result = await f.service({ action: 'publish', id: post.id, version: post.version }); assert.equal(result.submitted, true); assert.match(result.url, /\/posts\/[a-f0-9]{32}\.html$/); assert.equal(f.drafts.size, 0); assert.equal(f.commits, 1); const loaded = await f.service({ action: 'get', id: post.id }); assert.equal(loaded.status, 'published'); assert.equal(loaded.version, 0); assert.equal(splitContent(loaded.content).data.layout, 'post'); });
test('editing published article keeps live content unchanged until publish', async () => { const f = fixture(), post = await saved(f); await f.service({ action: 'publish', id: post.id, version: 1 }); const current = await f.service({ action: 'get', id: post.id }); await f.service({ action: 'save', ...current, content: current.content + '\nprivate addition' }); assert.equal(f.commits, 1); assert.ok(!f.published.get(post.id).content.includes('private addition')); assert.equal((await f.service({ action: 'list' })).articles[0].status, 'changed'); });
test('two tabs cannot overwrite each other’s drafts', async () => { const f = fixture(), post = await saved(f); await assert.rejects(f.service({ action: 'save', ...post, version: 0, content: 'overwrite' }), { status: 409 }); assert.equal(f.drafts.get(post.id).content, post.content); });
test('publishing stale draft version is rejected', async () => { const f = fixture(), post = await saved(f); await assert.rejects(f.service({ action: 'publish', id: post.id, version: 0 }), { status: 409 }); assert.equal(f.commits, 0); });
test('GitHub concurrent change prevents lost update', async () => { const f = fixture(), post = await saved(f); f.published.set(post.id, { id: post.id, content: post.content, sha: 'b'.repeat(40) }); await assert.rejects(f.service({ action: 'publish', id: post.id, version: 1 }), { status: 409 }); assert.equal(f.drafts.size, 1); assert.equal(f.commits, 0); });
test('failed GitHub request preserves draft and releases lock', async () => { const f = fixture(), post = await saved(f); f.failPut(); await assert.rejects(f.service({ action: 'publish', id: post.id, version: 1 })); assert.equal(f.drafts.size, 1); assert.equal(f.locks.size, 0); });
test('retries recover after GitHub commit succeeds but database cleanup fails', async () => { const f = fixture(), post = await saved(f); f.failCleanup(); await assert.rejects(f.service({ action: 'publish', id: post.id, version: 1 })); assert.equal(f.commits, 1); await f.service({ action: 'publish', id: post.id, version: 1 }); assert.equal(f.commits, 1); assert.equal(f.drafts.size, 0); });
test('new article cannot reuse another article permalink', async () => { const f = fixture(), post = await saved(f, { ...newPost(), content: newTemplate('study', new Date(), '898b317c') }); await assert.rejects(f.service({ action: 'publish', id: post.id, version: 1 }), { status: 400 }); });
test('published article cannot silently change permalink', () => { const old = { content: newTemplate('study', new Date(), '898b317c') }; assert.throws(() => preparePublish({ content: newTemplate('study', new Date(), 'other'), updated_at: new Date() }, old), { status: 400 }); });
test('discard removes only draft and retains published article', async () => { const f = fixture(), post = await saved(f); f.published.set(post.id, { id: post.id, content: post.content, sha: 'a'.repeat(40) }); await f.service({ action: 'discard', id: post.id, version: 1 }); assert.equal(f.drafts.size, 0); assert.equal(f.published.size, 1); assert.equal(f.commits, 0); });
test('delete requires exact confirmation and current online SHA', async () => { const f = fixture(), post = await saved(f); await f.service({ action: 'publish', id: post.id, version: 1 }); const sha = f.published.get(post.id).sha; await assert.rejects(f.service({ action: 'delete', id: post.id, version: 0, publishedSha: sha }), { status: 400 }); await assert.rejects(f.service({ action: 'delete', id: post.id, version: 0, confirm: post.id, publishedSha: 'b'.repeat(40) }), { status: 409 }); await f.service({ action: 'delete', id: post.id, version: 0, confirm: post.id, publishedSha: sha }); assert.equal(f.published.size, 0); assert.equal(f.commits, 2); });
test('global repository lock serializes writes', async () => { const f = fixture(); f.locks.add('repository-write'); await assert.rejects(f.service({ action: 'save', ...newPost() }), { status: 409 }); });

async function callHandler(body, overrides = {}, dependencies = {}) {
  const f = fixture(); const handler = createHandler({ readConfig: () => config, createStore: () => f.store, createGithub: () => f.github, ...dependencies });
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; }, end() {} };
  await handler({ method: 'POST', headers: { origin: config.origins[0], 'content-type': 'application/json' }, body, ...overrides }, response);
  return response;
}
test('all article actions are denied without login', async () => { for (const action of ['list', 'get', 'save', 'publish', 'delete', 'discard']) { const response = await callHandler({ action, ...newPost() }); assert.equal(response.code, 401); assert.equal(response.headers['Cache-Control'], 'no-store, private'); } });
test('untrusted origins and simple form POST cannot login', async () => { const a = await callHandler({ action: 'login', password: config.password }, { headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }); assert.equal(a.code, 403); const b = await callHandler({ action: 'login', password: config.password }, { headers: { origin: config.origins[0], 'content-type': 'text/plain' } }); assert.equal(b.code, 415); });
test('valid login returns token but never password or GitHub secret', async () => { const res = await callHandler({ action: 'login', password: config.password }); assert.equal(res.code, 200); authenticate(`Bearer ${res.body.token}`, config); assert.ok(!JSON.stringify(res.body).includes(config.password)); });
test('rate limited login fails before accepting correct password', async () => { const res = await callHandler({ action: 'login', password: config.password }, {}, { createStore: () => ({ async limit() { throw new EditorError(429, 'limited'); } }) }); assert.equal(res.code, 429); assert.equal(res.headers['Retry-After'], '900'); });
test('preflight only allows configured origin and required headers', async () => { const res = await callHandler(null, { method: 'OPTIONS' }); assert.equal(res.code, 204); assert.equal(res.headers['Access-Control-Allow-Origin'], config.origins[0]); assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization'); });
test('malformed JSON and backend failures do not leak raw errors', async () => { assert.equal((await callHandler('{')).code, 400); const res = await callHandler({ action: 'login', password: config.password }, {}, { createStore: () => { throw Error('postgresql://secret-password@host'); } }); assert.equal(res.code, 503); assert.ok(!JSON.stringify(res.body).includes('secret-password')); });
test('GitHub requests pin branch and carry expected SHA; file path cannot escape', async () => { const calls = []; const github = createGithub(config, async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ content: { sha: 'b'.repeat(40) }, commit: { sha: 'commit' } }) }; }); await github.put('测试.md', 'hello', 'a'.repeat(40)); const body = JSON.parse(calls[0].opts.body); assert.equal(body.branch, 'main'); assert.equal(body.sha, 'a'.repeat(40)); assert.equal(Buffer.from(body.content, 'base64').toString(), 'hello'); assert.match(calls[0].url, /source\/_posts\/%/); await assert.rejects(github.put('../config.yml', '', null)); });
test('preview sanitizes scripts, event handlers and dangerous URLs', () => { const dom = new JSDOM(''); const raw = newTemplate() + '\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form>'; const preview = renderPreview(raw, dom.window); const parsed = new JSDOM(preview.html); assert.equal(parsed.window.document.querySelectorAll('script,iframe,form,input,[onerror],[onclick]').length, 0); assert.equal(parsed.window.document.querySelector('a')?.getAttribute('href'), null); assert.match(preview.html, /default-src 'none'/); dom.window.close(); parsed.window.close(); });
test('preview renders C++ code, tables, Chinese metadata and invalid YAML warning', () => { const dom = new JSDOM(''); const result = renderPreview(newTemplate('algorithm') + '\n| A | B |\n|---|---|\n|1|2|', dom.window); assert.match(result.html, /<table>/); assert.match(result.html, /language-cpp/); assert.equal(result.title, '一道题的思考'); assert.ok(renderPreview('---\ntitle: [\n---\n正文', dom.window).warning); dom.window.close(); });
