const LIMIT = 2 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('无法读取这张图片，请重新选择。'));
    reader.readAsDataURL(file);
  });
}
export function mountImageUpload({ textarea, request, run, changed, notify, available, busy, currentId }) {
  let uploading = false;
  const toolbar = document.querySelector('.markdown-toolbar');
  const button = document.createElement('button');
  button.id = 'upload-image'; button.type = 'button'; button.textContent = '↑ 上传图片';
  button.title = '选择图片上传，也可在编辑栏粘贴截图';
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = [...TYPES].join(','); picker.multiple = true; picker.hidden = true;
  const note = document.createElement('p');
  note.className = 'field-note'; note.id = 'image-upload-status'; note.setAttribute('role', 'status');
  const help = '可粘贴截图或上传图片 · 单张最多 2 MB · 上传后图片立即公开，草稿图片也一样。';
  note.textContent = help;
  toolbar.append(button, picker); toolbar.after(note);
  async function upload(files) {
    if (!files.length) return;
    if (!available()) { notify('请先登录写作间并打开文章，再上传图片。离线试写不支持上传。', true); return; }
    if (busy() || uploading) { notify('当前操作尚未完成，请稍后再上传图片。'); return; }
    if (files.length > 5) { notify('一次最多上传 5 张图片，请分批选择。', true); return; }
    if (files.some(file => !TYPES.has(file.type) || !file.size || file.size > LIMIT)) { notify('请选择 PNG、JPG、WebP 或 GIF 图片，单张不能超过 2 MB。', true); return; }
    const id = currentId(), original = textarea.value;
    let start = textarea.selectionStart, end = textarea.selectionEnd;
    await run(async () => {
      uploading = true;
      const wasReadOnly = textarea.readOnly;
      const buttons = [...toolbar.querySelectorAll('button')].map(node => [node, node.disabled]);
      textarea.readOnly = true; buttons.forEach(([node]) => { node.disabled = true; });
      let expected = original, completed = 0;
      try {
        for (const file of files) {
          note.textContent = `正在上传图片 ${completed + 1}/${files.length}，请稍候…`;
          const result = await request('image.upload', { base64: await fileBase64(file) });
          if (currentId() !== id || textarea.value !== expected) throw new Error('编辑内容已变化。图片已上传，请重新选择图片以插入链接；相同图片不会重复存储。');
          const label = (file.name || '图片').replace(/\.[^.]+$/, '').replace(/[\\\[\]\r\n<>]/g, '_').slice(0, 80) || '图片';
          const markdown = `\n![${label}](${result.url})\n`;
          textarea.setRangeText(markdown, start, end, 'end');
          expected = textarea.value; start = end = textarea.selectionEnd;
          completed++; changed();
        }
        notify(`已上传 ${completed} 张图片并插入链接。请保存草稿或发布文章。`);
      } finally {
        uploading = false; textarea.readOnly = wasReadOnly;
        buttons.forEach(([node, disabled]) => { node.disabled = disabled; });
        note.textContent = help; textarea.focus();
      }
    });
  }
  button.addEventListener('click', () => {
    if (!available()) { notify('请先登录写作间并打开文章，再上传图片。', true); return; }
    picker.click();
  });
  picker.addEventListener('change', () => { const files = [...picker.files]; picker.value = ''; void upload(files); });
  textarea.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
    if (files.length) { event.preventDefault(); void upload(files); }
  });
  window.addEventListener('beforeunload', event => { if (uploading) { event.preventDefault(); event.returnValue = ''; } });
}
