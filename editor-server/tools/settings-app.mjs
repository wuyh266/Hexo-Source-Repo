export function mountSettings({ request, run, canLeave, notify, isOffline, onOpen, showPublishNotice }) {
  const view = document.createElement('section');
  view.id = 'settings-view'; view.className = 'site-settings'; view.hidden = true;
  view.innerHTML = `
    <div class="library-heading"><div><p class="eyebrow">A HOME FOR YOUR WORDS</p><h1>网站设置<span>。</span></h1><p class="muted">公告、个人介绍和导航，在这里一起打理。</p></div></div>
    <form id="settings-form">
      <div class="settings-bar"><span id="settings-status" role="status">尚未读取</span><div><button type="button" class="button quiet" id="settings-reload">重新读取</button><button type="submit" class="button primary" id="settings-save">保存并发布 ↗</button></div></div>
      <div class="settings-columns"><div class="settings-fields">
        <fieldset><legend>01 · 博客与作者</legend>
          <label>博客名称<input name="title" maxlength="100" required></label>
          <label>作者名称<input name="author" maxlength="80" required></label>
          <label>博客简介<textarea name="description" maxlength="500" rows="3"></textarea></label>
          <label>首页副标题<input name="subtitle" maxlength="200"></label>
          <label class="check-label"><input name="subtitleEnabled" type="checkbox"> 显示首页副标题</label>
          <label>头像地址<input name="avatar" maxlength="500" placeholder="/img/touxiang.png" required></label><p class="field-note">可用已有站内图片路径或 HTTPS 图片网址。目前不包含图片上传。</p>
        </fieldset>
        <fieldset><legend>02 · 侧栏公告</legend>
          <label class="check-label"><input name="announcementEnabled" type="checkbox"> 显示公告</label>
          <label>公告内容<textarea name="announcement" maxlength="5000" rows="7" placeholder="写下想告诉读者的话，支持换行。"></textarea></label>
          <p class="field-note">填写纯文本即可，换行会保留。HTML 会作为文字显示。</p>
        </fieldset>
        <fieldset><legend>03 · 页脚与个人链接</legend>
          <label>页脚附加文字<textarea name="footerText" maxlength="1000" rows="3"></textarea></label>
          <label>个人链接按钮文字<input name="followText" maxlength="50"></label>
          <label>个人链接地址<input name="followUrl" maxlength="500" placeholder="https://github.com/你的用户名"></label><p class="field-note">链接留空时隐藏侧栏的个人链接按钮。</p>
        </fieldset>
        <fieldset><legend>04 · 顶部导航</legend><p class="field-note">每行一项，按「名称 | 地址 | 图标」填写。图标可省略；顺序就是网站显示顺序，最多 12 项。</p>
          <label>导航菜单<textarea name="menuText" rows="7" spellcheck="false" placeholder="首页 | / | fas fa-home\n归档 | /archives/ | fas fa-archive"></textarea></label>
          <p class="field-note">站内地址以 / 开头，外部网址使用 https://。即使移除导航中的写作间，仍可通过 /editor/ 登录。</p>
        </fieldset>
      </div><aside class="settings-preview"><div class="pane-title"><span>效果预览</span><span class="live-label">随输入更新</span></div><div class="settings-preview-body">
        <p class="eyebrow">BLOG / PROFILE</p><h2 id="settings-preview-title"></h2><p id="settings-preview-author"></p><p id="settings-preview-description"></p>
        <div id="settings-preview-announcement"><h3>◉ 公告</h3><p id="settings-preview-announcement-text"></p></div>
        <p id="settings-preview-hidden" hidden>公告已关闭</p><div class="settings-preview-footer" id="settings-preview-footer"></div>
        <p class="field-note">这是内容预览。保存后需等待网站构建完成，首页才会更新。</p>
      </div></aside></div>
    </form>`;
  document.querySelector('#main').append(view);
  const $ = selector => view.querySelector(selector), form = $('#settings-form');
  const textKeys = ['title', 'author', 'description', 'subtitle', 'avatar', 'announcement', 'footerText', 'followText', 'followUrl'];
  const boolKeys = ['subtitleEnabled', 'announcementEnabled'];
  let saved = null, sha = null;
  const raw = () => Object.fromEntries([...textKeys, 'menuText'].map(key => [key, form.elements[key].value]).concat(boolKeys.map(key => [key, form.elements[key].checked])));
  let savedForm = '';
  const isDirty = () => !view.hidden && saved !== null && JSON.stringify(raw()) !== savedForm;
  function preview() {
    const values = raw();
    $('#settings-preview-title').textContent = values.title || '博客名称';
    $('#settings-preview-author').textContent = values.author;
    $('#settings-preview-description').textContent = values.description;
    $('#settings-preview-announcement-text').textContent = values.announcement || '在左侧写下公告…';
    $('#settings-preview-announcement').hidden = !values.announcementEnabled;
    $('#settings-preview-hidden').hidden = values.announcementEnabled;
    $('#settings-preview-footer').textContent = values.footerText;
    $('#settings-status').textContent = isDirty() ? '有未发布修改' : '已读取当前设置';
  }
  function fill(data) {
    for (const key of textKeys) form.elements[key].value = data[key];
    for (const key of boolKeys) form.elements[key].checked = data[key];
    form.elements.menuText.value = data.menu.map(item => `${item.label} | ${item.url} | ${item.icon}`).join('\n');
    savedForm = JSON.stringify(raw()); preview();
  }
  function readSettings() {
    const values = raw(), lines = values.menuText.split('\n').map(v => v.trim()).filter(Boolean); delete values.menuText;
    values.menu = lines.map(line => {
      const parts = line.split('|').map(v => v.trim());
      if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) throw new Error('导航每行请填写：名称 | 地址 | 图标（图标可省略）。');
      return { label: parts[0], url: parts[1], icon: parts[2] || 'fas fa-link' };
    });
    return values;
  }
  async function open() {
    if (isOffline()) { notify('请先登录，才能管理网站设置。'); return; }
    if (!await canLeave()) return;
    const result = await request('settings.get');
    saved = result.settings; sha = result.sha; onOpen(); view.hidden = false; fill(saved);
    document.querySelectorAll('[data-filter]').forEach(button => button.classList.remove('active'));
    document.querySelector('#website-settings').classList.add('active');
    window.scrollTo(0, 0);
  }
  function hide() {
    view.hidden = true;
    if (saved) fill(saved);
    document.querySelector('#website-settings').classList.remove('active');
  }
  form.addEventListener('input', preview);
  $('#settings-reload').addEventListener('click', () => run(open));
  form.addEventListener('submit', event => { event.preventDefault(); run(async () => {
    if (!form.reportValidity() || !saved) return;
    const snapshot = JSON.stringify(raw());
    $('#settings-status').textContent = '正在提交网站设置…';
    const result = await request('settings.save', { sha, settings: readSettings() });
    saved = result.settings; sha = result.sha;
    if (JSON.stringify(raw()) === snapshot) fill(saved);
    else {
      const edited = raw(); fill(saved);
      for (const [key, value] of Object.entries(edited)) { if (typeof value === 'boolean') form.elements[key].checked = value; else form.elements[key].value = value; }
      preview();
    }
    showPublishNotice(result.submitted ? '网站设置已提交，等待博客构建完成后生效。' : '这些设置已保存，无需重复发布。', result.actionsUrl);
    $('#settings-status').textContent = isDirty() ? '已提交上一版；还有新修改未保存' : '设置已保存';
    notify('网站设置已保存。');
  }); });
  for (const id of ['#website-settings', '#mobile-settings']) document.querySelector(id).addEventListener('click', () => run(open));
  return { isDirty, hide, isOpen: () => !view.hidden };
}
