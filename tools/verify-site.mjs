// Run explicitly after building; keep outside Hexo's auto-loaded scripts directory.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const output = process.argv[2] || 'public';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function checkHtml(relative) {
  const path = join(output, relative);
  const html = readFileSync(path, 'utf8');
  if (!/<html\b/i.test(html) || !/<body\b/i.test(html) || !/<\/html>/i.test(html) || !/<title>[^<]+<\/title>/i.test(html)) {
    throw new Error(`Missing or empty rendered HTML: ${path}`);
  }
  return html;
}

const home = checkHtml('index.html');
if (!home.includes('recent-posts')) throw new Error('Homepage has no Butterfly article list');
const config = readFileSync('_config.butterfly.yml', 'utf8');
const waline = config.match(/^waline:\s*\n\s+serverURL:\s*(https:\/\/[^\s#]+)/m)?.[1];
if (!waline || !checkHtml('comments/index.html').includes(waline)) {
  throw new Error('Published comments page is missing the configured Waline URL');
}

let articleCount = 0;
for (const path of walk('source/_posts').filter(path => path.endsWith('.md'))) {
  const source = readFileSync(path, 'utf8');
  const id = source.match(/^abbrlink:\s*['"]?([a-f0-9]+)['"]?\s*$/m)?.[1];
  if (!id) throw new Error(`Article has no generated abbrlink: ${path}`);
  checkHtml(`posts/${id}.html`);
  articleCount++;
}
for (const path of walk(output).filter(path => path.endsWith('.html'))) {
  if (statSync(path).size === 0) throw new Error(`Empty page: ${path}`);
}
for (const asset of ['css/index.css', 'js/main.js', 'img/bac_v2.jpg']) {
  if (statSync(join(output, asset)).size === 0) throw new Error(`Empty asset: ${asset}`);
}
if (readFileSync(join(output, 'CNAME'), 'utf8').trim() !== '542501.xyz') {
  throw new Error('Published CNAME does not match the blog domain');
}
console.log(`Verified homepage, comments, ${articleCount} articles, assets and CNAME.`);
