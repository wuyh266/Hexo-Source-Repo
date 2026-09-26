import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { EditorError } from './content.mjs';

export function createStore(connection, connect = neon) {
  const sql = connect(connection);
  return {
    async list() { return sql`SELECT * FROM blog_editor.drafts ORDER BY updated_at DESC`; },
    async get(id) { return (await sql`SELECT * FROM blog_editor.drafts WHERE id = ${id}`)[0] || null; },
    async save(id, content, baseSha, version) {
      const rows = version === 0
        ? await sql`INSERT INTO blog_editor.drafts(id, content, base_sha) VALUES (${id}, ${content}, ${baseSha}) ON CONFLICT DO NOTHING RETURNING *`
        : await sql`UPDATE blog_editor.drafts SET content=${content}, version=version+1, updated_at=now() WHERE id=${id} AND version=${version} RETURNING *`;
      if (!rows.length) throw new EditorError(409, '草稿已在另一页面修改。请先导出当前内容，再重新打开文章。');
      return rows[0];
    },
    async remove(id) { await sql`DELETE FROM blog_editor.drafts WHERE id = ${id}`; },
    async lock(id) {
      const token = randomUUID();
      const rows = await sql`INSERT INTO blog_editor.locks(id, token, expires_at) VALUES (${id}, ${token}, now() + interval '3 minutes') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token, expires_at=EXCLUDED.expires_at WHERE blog_editor.locks.expires_at < now() RETURNING token`;
      if (!rows.length) throw new EditorError(409, '另一项保存或发布操作正在进行，请稍后重试。');
      return async () => { await sql`DELETE FROM blog_editor.locks WHERE id=${id} AND token=${token}`; };
    },
    async limit(key, maximum) {
      const bucket = Math.floor(Date.now() / 900000);
      const rows = await sql`INSERT INTO blog_editor.login_limits(key, bucket, attempts) VALUES (${key}, ${bucket}, 1) ON CONFLICT (key) DO UPDATE SET bucket=EXCLUDED.bucket, attempts=CASE WHEN blog_editor.login_limits.bucket=EXCLUDED.bucket THEN blog_editor.login_limits.attempts+1 ELSE 1 END RETURNING attempts`;
      if (rows[0].attempts > maximum) throw new EditorError(429, '登录尝试过于频繁，请在 15 分钟后重试。');
      // Bounded cleanup; never includes article or Waline data.
      await sql`DELETE FROM blog_editor.login_limits WHERE bucket < ${bucket - 1}`;
    }
  };
}
