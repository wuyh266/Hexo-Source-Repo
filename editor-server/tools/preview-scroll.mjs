// The preview permits parent DOM access, but never permits article scripts.
export function connectPreviewScroll(editor, frame) {
  let position = { top: 0 }, loading = false, observer;
  const expected = new WeakMap();
  const limit = node => Math.max(0, node.scrollHeight - node.clientHeight);
  const scroller = () => frame.contentDocument?.scrollingElement || frame.contentDocument?.documentElement;
  function move(node, top) {
    if (!node) return;
    const next = Math.max(0, Math.min(limit(node), top));
    if (Math.abs(node.scrollTop - next) < 1) return;
    expected.set(node, next);
    node.scrollTop = next;
  }
  function internal(node) {
    const target = expected.get(node);
    expected.delete(node);
    return target !== undefined && Math.abs(node.scrollTop - target) < 2;
  }
  function restore() {
    if (loading) return;
    const node = scroller();
    if (node) move(node, position.ratio !== undefined ? position.ratio * limit(node) : position.top);
  }
  editor.addEventListener('scroll', () => {
    if (internal(editor)) return;
    position = { ratio: limit(editor) ? editor.scrollTop / limit(editor) : 0 };
    restore();
  }, { passive: true });
  frame.addEventListener('load', () => {
    observer?.disconnect();
    loading = false;
    const doc = frame.contentDocument, node = scroller();
    if (!doc || !node) return;
    restore();
    doc.addEventListener('scroll', () => {
      if (loading || internal(node)) return;
      position = { top: node.scrollTop };
      if (limit(node)) move(editor, node.scrollTop / limit(node) * limit(editor));
    }, { passive: true });
    // Images and pane resizing can change the height after the document loads.
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(restore);
      observer.observe(doc.body);
      observer.observe(frame);
    }
  });
  return {
    update(html) {
      if (!loading) {
        const node = scroller();
        if (node) position = { top: node.scrollTop };
      }
      loading = true;
      observer?.disconnect();
      frame.srcdoc = html;
    },
    reset() {
      position = { top: 0 };
      loading = true;
      observer?.disconnect();
      move(editor, 0);
    }
  };
}
