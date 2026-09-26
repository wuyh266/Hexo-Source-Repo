// Optional local backend only. Requires Node 22 and an ignored .env file.
import http from 'node:http';
import handler from '../api/editor.js';
http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  if (req.url !== '/api/editor') return res.status(404).end();
  let body = '', bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 550000) return res.status(413).end(); body += chunk; }
  req.body = body;
  await handler(req, res);
}).listen(4318, '127.0.0.1', () => console.log('Editor API available at http://127.0.0.1:4318 (localhost only).'));
