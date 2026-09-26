// Runs for both local Hexo previews and GitHub Pages builds.
const fs = require('node:fs');
const path = require('node:path');
const { applySettings } = require(path.join(hexo.base_dir, 'editor-server/lib/settings-schema.cjs'));
hexo.extend.filter.register('before_generate', function () {
  const file = path.join(this.base_dir, 'site-settings.json');
  if (fs.existsSync(file)) applySettings(this, JSON.parse(fs.readFileSync(file, 'utf8')));
}, 1);
