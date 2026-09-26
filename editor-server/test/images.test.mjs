import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseImage, uploadImage, IMAGE_LIMIT } from '../lib/images.mjs';
import { createGithub } from '../lib/github.mjs';
import { createHandler } from '../api/editor.js';
import { issueToken } from '../lib/auth.mjs';
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const config = { repository: 'owner/blog', branch: 'main', githubToken: 'test', origins: ['https://example.com'], secret: 'a-test-secret-at-least-thirty-two-characters' };
test('image validation uses file bytes, rejects SVG, invalid base64 and oversize data', () => {
  assert.match(parseImage({ base64 }).filename, /^[a-f0-9]{64}\.png$/);
  assert.throws(() => parseImage({ base64: Buffer.from('<svg onload="alert(1)"/>').toString('base64'), type: 'image/png' }), { status: 400 });
  for (const value of ['', '!!!!', 'YQ=A', 'data:image/png;base64,' + base64, Buffer.alloc(IMAGE_LIMIT + 1).toString('base64')]) assert.throws(() => parseImage({ base64: value }), { status: 400 });
  const large = Buffer.alloc(IMAGE_LIMIT); Buffer.from(base64, 'base64').copy(large);
  assert.match(parseImage({ base64: large.toString('base64') }).filename, /\.png$/);
});
test('image upload reuses repository write lease and releases it on failure', async () => {
  const calls = [];
  const store = { async limit() {}, async lock(key) { calls.push(key); return async () => calls.push('unlock'); } };
  const result = await uploadImage({ base64, filename: '../../secret' }, store, { async putImage(name) { calls.push(name); } }, config);
  assert.equal(calls[0], 'repository-write'); assert.equal(calls.at(-1), 'unlock');
  assert.match(result.url, /^https:\/\/raw\.githubusercontent\.com\/owner\/blog\/main\/source\/img\/uploads\/[a-f0-9]{64}\.png$/);
  await assert.rejects(uploadImage({ base64 }, store, { async putImage() { throw Error('network'); } }, config));
  assert.equal(calls.at(-1), 'unlock');
});
test('GitHub image writes are restricted and repeated uploads do not create commits', async () => {
  let stored = null; const calls = [];
  const github = createGithub(config, async (url, opts) => {
    calls.push({ url, opts });
    if (opts.method === 'GET') return { status: stored ? 200 : 404, ok: !!stored, json: async () => stored };
    const body = JSON.parse(opts.body), bytes = Buffer.from(body.content, 'base64');
    assert.equal(body.branch, 'main');
    stored = { type: 'file', sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
    return { ok: true, status: 201, json: async () => ({ content: stored }) };
  });
  const image = parseImage({ base64 });
  await github.putImage(image.filename, base64); await github.putImage(image.filename, base64);
  assert.equal(calls.filter(c => c.opts.method === 'PUT').length, 1);
  assert.ok(calls.every(c => c.url.includes('/contents/source/img/uploads/')));
  await assert.rejects(github.putImage('../bad.png', base64), { status: 400 });
});
test('image endpoint requires login and accepts image payloads above article limit', async () => {
  let writes = 0;
  const handler = createHandler({ readConfig: () => config, createStore: () => ({ async limit() {}, async lock() { return async () => {}; } }), createGithub: () => ({ async putImage() { writes++; } }) });
  async function invoke(auth, payload) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method: 'POST', headers: { origin: config.origins[0], 'content-type': 'application/json', authorization: auth }, body: payload }, res); return res;
  }
  assert.equal((await invoke(undefined, { action: 'image.upload', base64 })).code, 401); assert.equal(writes, 0);
  const large = Buffer.alloc(600000); Buffer.from(base64, 'base64').copy(large);
  assert.equal((await invoke(`Bearer ${issueToken(config)}`, { action: 'image.upload', base64: large.toString('base64') })).code, 200);
  assert.equal(writes, 1);
});
