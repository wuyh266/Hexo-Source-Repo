import { readConfig, correctPassword, issueToken, authenticate, loginKey } from '../lib/auth.mjs';
import { EditorError } from '../lib/content.mjs';
import { createStore } from '../lib/store.mjs';
import { createGithub } from '../lib/github.mjs';
import { createService } from '../lib/service.mjs';
import { handleSettings } from '../lib/settings.mjs';

export function createHandler(dependencies = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    try {
      const config = (dependencies.readConfig || readConfig)();
      const origin = req.headers.origin;
      if (!origin || !config.origins.includes(origin)) throw new EditorError(403, '此网站不在编辑服务允许访问的域名中。');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.status(204).end();
      if (req.method !== 'POST') throw new EditorError(405, '请使用编辑器进行操作。');
      if (!req.headers['content-type']?.startsWith('application/json')) throw new EditorError(415, '仅支持 JSON 请求。');
      const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 550000) throw new EditorError(400, '请求内容不合法或过大。');
      const store = (dependencies.createStore || createStore)(config.database);
      if (input.action === 'login') {
        await store.limit('global', 60);
        await store.limit(loginKey(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown', config), 10);
        if (!correctPassword(input.password, config)) throw new EditorError(401, '密码不正确。这里使用独立的写作间密码，不是评论账号密码。');
        return res.status(200).json({ token: issueToken(config), expiresIn: 14400 });
      }
      authenticate(req.headers.authorization, config);
      const github = (dependencies.createGithub || createGithub)(config);
      const result = ['settings.get', 'settings.save'].includes(input.action)
        ? await handleSettings(input, store, github, config)
        : await createService(store, github, config)(input);
      return res.status(200).json(result);
    } catch (error) {
      const status = error instanceof EditorError ? error.status : error instanceof SyntaxError ? 400 : 503;
      if (status === 429) res.setHeader('Retry-After', '900');
      // Do not log raw database errors: they may contain connection strings or draft text.
      return res.status(status).json({ error: error instanceof EditorError ? error.message : '服务暂时不可用，请检查数据库初始化和连接配置；内容未被自动删除。' });
    }
  };
}
export default createHandler();
