import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { EditorError } from './content.mjs';
const digest = value => createHash('sha256').update(value).digest();
export function readConfig(env = process.env) {
  const names = ['EDITOR_PASSWORD', 'SESSION_SECRET', 'DATABASE_URL', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'ALLOWED_ORIGINS'];
  if (names.some(name => !env[name]) || env.EDITOR_PASSWORD.length < 16 || env.SESSION_SECRET.length < 32 || env.EDITOR_PASSWORD.startsWith('replace-') || env.SESSION_SECRET.startsWith('replace-')) throw new EditorError(503, '编辑服务尚未配置完成，请检查服务端环境变量。');
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY)) throw new EditorError(503, '服务端仓库配置错误。');
  return { password: env.EDITOR_PASSWORD, secret: env.SESSION_SECRET, database: env.DATABASE_URL, githubToken: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY, branch: env.GITHUB_BRANCH || 'main', origins: env.ALLOWED_ORIGINS.split(',').map(s => s.trim()), blogUrl: env.BLOG_URL || 'https://542501.xyz' };
}
export function correctPassword(value, config) {
  return typeof value === 'string' && value.length <= 256 && timingSafeEqual(digest(value), digest(config.password));
}
export function issueToken(config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: 'owner', exp: Math.floor(now / 1000) + 4 * 3600, v: 1 })).toString('base64url');
  return `${payload}.${createHmac('sha256', config.secret).update(payload).digest('base64url')}`;
}
export function authenticate(header, config, now = Date.now()) {
  try {
    if (typeof header !== 'string' || header.length > 1000 || !header.startsWith('Bearer ')) throw 0;
    const [payload, signature, extra] = header.slice(7).split('.');
    if (extra !== undefined || !payload || !signature) throw 0;
    const expected = createHmac('sha256', config.secret).update(payload).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw 0;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.sub !== 'owner' || claims.v !== 1 || !Number.isInteger(claims.exp) || claims.exp <= now / 1000) throw 0;
  } catch { throw new EditorError(401, '登录已过期，请重新登录；未保存内容仍保留在当前编辑页。'); }
}
export function loginKey(ip, config) { return createHmac('sha256', config.secret).update(String(ip)).digest('hex'); }
