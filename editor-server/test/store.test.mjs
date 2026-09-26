import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createStore } from '../lib/store.mjs';

test('real PostgreSQL schema, parameterized drafts, atomic versions, leases and rate limits', async () => {
  const db = new PGlite();
  try {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    await db.exec(schema); await db.exec(schema); // safe, repeatable initialization
    const store = createStore('test', () => async (strings, ...values) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      return (await db.query(query, values)).rows;
    });
    const id = 'test.md', hostile = "private ' ; DROP TABLE blog_editor.drafts; --";
    const first = await store.save(id, hostile, null, 0);
    assert.equal(first.version, 1); assert.equal((await store.get(id)).content, hostile);
    await assert.rejects(store.save(id, 'overwrite', null, 0), { status: 409 });
    const results = await Promise.allSettled([store.save(id, 'first edit', null, 1), store.save(id, 'second edit', null, 1)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await store.get(id)).version, 2);
    assert.equal((await store.list()).length, 1);
    const release = await store.lock('repository-write');
    await assert.rejects(store.lock('repository-write'), { status: 409 });
    await release(); await (await store.lock('repository-write'))();
    await db.exec("INSERT INTO blog_editor.locks VALUES ('expired', 'old', now()-interval '1 minute')");
    await (await store.lock('expired'))();
    await store.limit('login-test', 2); await store.limit('login-test', 2);
    await assert.rejects(store.limit('login-test', 2), { status: 429 });
    await db.exec("UPDATE blog_editor.login_limits SET bucket=0 WHERE key='login-test'");
    await store.limit('login-test', 2);
    await store.remove(id); assert.equal(await store.get(id), null);
  } finally { await db.close(); }
});
