// Public titles only: drafts live in Neon and never enter this file.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import yaml from 'js-yaml';
const metadata = {};
const links = new Set();
for (const id of await readdir('source/_posts')) {
  if (!id.endsWith('.md')) continue;
  const text = await readFile(`source/_posts/${id}`, 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!header) continue;
  const data = yaml.load(header[1], { schema: yaml.JSON_SCHEMA });
  const abbrlink = String(data.abbrlink ?? '');
  if (abbrlink && links.has(abbrlink)) throw new Error(`Duplicate article abbrlink: ${abbrlink}`);
  if (abbrlink) links.add(abbrlink);
  metadata[id] = { title: data.title || id, categories: Array.isArray(data.categories) ? data.categories.flat() : [] };
}
await mkdir('source/editor', { recursive: true });
await writeFile('source/editor/published.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(`Generated editor title index for ${Object.keys(metadata).length} published articles.`);
