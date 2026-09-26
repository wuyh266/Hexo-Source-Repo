import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPreviewScroll } from '../tools/preview-scroll.mjs';

function fixture() {
  const editor = Object.assign(new EventTarget(), { scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
  const doc = new EventTarget();
  const node = { scrollHeight: 3500, clientHeight: 500, scrollTop: 0 };
  doc.scrollingElement = node;
  const frame = Object.assign(new EventTarget(), { contentDocument: doc });
  const controls = connectPreviewScroll(editor, frame);
  return { editor, doc, node, frame, controls, load() { node.scrollTop = 0; frame.dispatchEvent(new Event('load')); } };
}
test('preview preserves reading position across repeated render replacements', () => {
  const f = fixture(); f.load();
  f.node.scrollTop = 1234;
  f.controls.update('first'); f.controls.update('second'); f.load();
  assert.equal(f.node.scrollTop, 1234);
  f.controls.reset(); f.controls.update('new article'); f.load();
  assert.equal(f.node.scrollTop, 0);
});
test('scrolling either pane follows progress without a feedback loop, including during reload', () => {
  const f = fixture(); f.load();
  f.editor.scrollTop = 750; f.editor.dispatchEvent(new Event('scroll'));
  assert.equal(f.node.scrollTop, 1500);
  f.doc.dispatchEvent(new Event('scroll'));
  assert.equal(f.editor.scrollTop, 750);
  f.node.scrollTop = 2400; f.doc.dispatchEvent(new Event('scroll'));
  assert.equal(f.editor.scrollTop, 1200);
  f.editor.dispatchEvent(new Event('scroll'));
  f.controls.update('refresh');
  f.editor.scrollTop = 300; f.editor.dispatchEvent(new Event('scroll')); f.load();
  assert.equal(f.node.scrollTop, 600);
});
