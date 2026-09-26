import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('./editor-app.mjs', import.meta.url))], bundle: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'external', outfile: `${root}source/editor/app.js` });
console.log('Built source/editor/app.js with local Markdown, YAML and sanitization dependencies.');
