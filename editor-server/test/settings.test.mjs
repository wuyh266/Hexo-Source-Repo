import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import schema from '../lib/settings-schema.cjs';
import { handleSettings } from '../lib/settings.mjs';
import { createGithub } from '../lib/github.mjs';
import { createHandler } from '../api/editor.js';
const initial = JSON.parse(await readFile(new URL('../../site-settings.json', import.meta.url), 'utf8'));
const config = { repository: 'owner/blog', branch: 'main', githubToken: 'test' };
test('website settings read and write both require owner login', async () => {
  const handler = createHandler({ readConfig: () => ({ ...config, origins: ['https://542501.xyz'] }), createStore: () => ({}), createGithub: () => { throw Error('must not access GitHub'); } });
  for (const action of ['settings.get', 'settings.save']) {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: 'POST', headers: { origin: 'https://542501.xyz', 'content-type': 'application/json' }, body: { action, settings: initial, sha: 'a'.repeat(40) } }, response);
    assert.equal(response.code, 401);
  }
});
function fixture() {
  let file = { sha: 'a'.repeat(40), content: JSON.stringify(initial) }, writes = 0, locked = false;
  return {
    store: { async lock() { assert.equal(locked, false); locked = true; return async () => { locked = false; }; } },
    github: { async getSettings() { return file; }, async putSettings(content, sha) { assert.equal(sha, file.sha); file = { sha: 'b'.repeat(40), content }; writes++; return { sha: file.sha, commit: 'saved' }; } },
    get writes() { return writes; }, get locked() { return locked; }
  };
}
test('settings read, update and idempotent retry use a single versioned file', async () => {
  const f = fixture();
  const current = await handleSettings({ action: 'settings.get' }, f.store, f.github, config);
  const edited = { ...current.settings, announcement: '第一行\n第二行', title: '新博客名称' };
  const result = await handleSettings({ action: 'settings.save', settings: edited, sha: current.sha }, f.store, f.github, config);
  assert.equal(result.submitted, true); assert.equal(result.settings.announcement, edited.announcement);
  const retry = await handleSettings({ action: 'settings.save', settings: edited, sha: current.sha }, f.store, f.github, config);
  assert.equal(retry.submitted, false); assert.equal(f.writes, 1); assert.equal(f.locked, false);
  await assert.rejects(handleSettings({ action: 'settings.save', settings: { ...edited, title: '另一个页面' }, sha: current.sha }, f.store, f.github, config), { status: 409 });
  assert.equal(f.locked, false);
});
test('settings reject privileged fields, unsafe links and invalid menu names', () => {
  for (const edited of [
    { ...initial, GITHUB_TOKEN: 'attempt' }, { ...initial, theme: 'other' }, { ...initial, title: '' },
    { ...initial, avatar: 'javascript:alert(1)' }, { ...initial, avatar: '//evil.example/img.png' },
    { ...initial, followUrl: 'https://user:password@example.com' },
    { ...initial, menu: [{ label: '__proto__', url: '/', icon: 'fas fa-home' }] },
    { ...initial, menu: [{ label: 'bad', url: 'data:text/html,evil' }] },
    { ...initial, menu: [initial.menu[0], initial.menu[0]] },
    { ...initial, title: '<script>bad</script>' }, { ...initial, announcementEnabled: 'true' }
  ]) assert.throws(() => schema.validateSettings(edited));
});
test('theme application escapes announcement HTML, keeps line breaks, and preserves unrelated options', () => {
  const hexo = { config: { url: 'https://542501.xyz', theme: 'butterfly' }, theme: { config: { waline: { serverURL: 'unchanged' }, aside: { enable: true, card_recent_post: { limit: 5 } }, footer: { copyright: { enable: true } } } } };
  schema.applySettings(hexo, { ...initial, announcement: '<script>alert(1)</script>\n下一行', footerText: '<img onerror=bad>', subtitleEnabled: true });
  assert.equal(hexo.config.title, initial.title);
  assert.equal(hexo.theme.config.aside.card_announcement.content, '&lt;script&gt;alert(1)&lt;/script&gt;<br>下一行');
  assert.equal(hexo.theme.config.waline.serverURL, 'unchanged');
  assert.equal(hexo.theme.config.aside.card_recent_post.limit, 5);
  assert.equal(hexo.theme.config.subtitle.enable, true);
  assert.deepEqual(hexo.theme.config.subtitle.sub, [initial.subtitle]);
  assert.equal(hexo.config.url, 'https://542501.xyz');
});
test('settings GitHub methods always target site-settings.json and include version SHA', async () => {
  const calls = [];
  const github = createGithub(config, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => options.method === 'GET'
      ? { type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(initial)).toString('base64'), sha: 'a'.repeat(40), size: 1000 }
      : { content: { sha: 'b'.repeat(40) }, commit: { sha: 'commit' } } };
  });
  await github.getSettings(); await github.putSettings(JSON.stringify(initial), 'a'.repeat(40));
  assert.ok(calls.every(call => call.url.startsWith('https://api.github.com/repos/owner/blog/contents/site-settings.json')));
  assert.equal(JSON.parse(calls[1].options.body).sha, 'a'.repeat(40));
  assert.equal(JSON.parse(calls[1].options.body).branch, 'main');
});
