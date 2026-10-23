// Source-bound regression tests. These callbacks do not provide browser/input acceptance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = process.env.NECT_HISTORY_SOURCE || path.resolve(__dirname, '..');

function fixture(initialDocument) {
  let nextId = 0, dispatchDepth = 0;
  const nodes = new Map(), storage = new Map(initialDocument ? [['nect-cloud-document-v1', JSON.stringify(initialDocument)]] : []), pendingCaptureLoss = [];
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.attrs = {}; this.dataset = {};
      this.children = []; this.listeners = new Map(); this.style = {}; this.value = '';
      this.checked = false; this.disabled = false; this.clientWidth = 1000; this.clientHeight = 900;
      this.capture = new Set(); this.classes = new Set();
      this.classList = {
        remove: name => this.classes.delete(name),
        toggle: name => this.classes.has(name) ? (this.classes.delete(name), false) : (this.classes.add(name), true),
      };
    }
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value); }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(callback);
    }
    dispatch(name, options = {}) {
      const event = { target: this, preventDefault() {}, ...options };
      dispatchDepth++;
      try { for (const callback of this.listeners.get(name) || []) callback(event); }
      finally {
        dispatchDepth--;
        if (!dispatchDepth) while (pendingCaptureLoss.length) pendingCaptureLoss.shift()();
      }
    }
    closest(selector) {
      if (selector === '[data-id]' && this.dataset.id) return this;
      if (selector === '[data-guide]' && this.dataset.guide) return this;
      if (selector === 'input,textarea,select,[contenteditable=true]' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName)) return this;
      return this.parent?.closest(selector) || null;
    }
    // Fixed 1px/mm geometry isolates history from rendering and hit testing.
    getBoundingClientRect() { return { left: 0, top: 0, width: 210, height: 297 }; }
    setPointerCapture(id) { this.capture.add(id); }
    hasPointerCapture(id) { return this.capture.has(id); }
    releasePointerCapture(id) {
      if (this.capture.delete(id)) pendingCaptureLoss.push(() => this.dispatch('lostpointercapture', { pointerId: id }));
    }
    blur() { document.activeElement = null; }
    click() { if (!this.disabled) this.dispatch('click'); }
  }
  const document = new Element('document');
  document.activeElement = null;
  document.getElementById = id => { assert(nodes.has(id), `Missing fixture node ${id}`); return nodes.get(id); };
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const node = new Element(match[1], match[2]);
    node.checked = /\bchecked\b/.test(match[0]);
    nodes.set(match[2], node);
  }
  nodes.get('zoom').value = 'fit';
  const sandbox = {
    document,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    ResizeObserver: class { observe() {} },
    crypto: { randomUUID: () => `${initialDocument ? 'loaded' : 'synthetic'}-${++nextId}` },
  };
  vm.createContext(sandbox);
  // No rewriting or injected history accessor: run each production script verbatim.
  for (const file of ['model.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  const get = id => nodes.get(id);
  const doc = () => JSON.parse(storage.get('nect-cloud-document-v1'));
  const target = kind => get('canvas').children.find(node => kind === 'guide' ? node.dataset.guide : node.dataset.id && node.children.some(child => child.tagName === 'TEXT'));
  const pointer = (name, kind, x = kind === 'guide' ? 105 : 30, y = kind === 'guide' ? 80 : 25) => get('canvas').dispatch(name, { pointerId: 1, button: 0, clientX: x, clientY: y, target: target(kind) });
  const escape = () => document.dispatch('keydown', { target: document, key: 'Escape' });
  const shortcut = (direction, meta = false) => document.dispatch('keydown', { target: document, key: 'z', ctrlKey: !meta, metaKey: meta, shiftKey: direction === 'redo' });
  const loseCapture = () => { get('canvas').capture.delete(1); get('canvas').dispatch('lostpointercapture', { pointerId: 1 }); };
  return { get, doc, pointer, escape, shortcut, loseCapture };
}

function setup(kind = 'object', saturated = false) {
  const f = fixture();
  f.get('add-text').click();
  if (kind === 'guide') { f.get('add-guide-x').click(); f.get('edit-guides').checked = true; }
  f.get('snap').checked = false;
  if (saturated) for (let i = 0; i < 60; i++) f.get('add-rect').click();
  else { f.get('add-rect').click(); f.get('undo').click(); }
  return f;
}

function walk(f, direction) {
  const documents = [];
  while (!f.get(direction).disabled) {
    assert(documents.length < 65, 'History traversal terminates');
    f.get(direction).click(); documents.push(f.doc());
  }
  return documents;
}
function timeline(f) {
  const digest = doc => createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  return { undo: walk(f, 'undo').map(digest), redo: walk(f, 'redo').map(digest) };
}
function finish(f, ending, kind) {
  if (ending === 'Escape') f.escape();
  else if (ending === 'lostpointercapture') f.loseCapture();
  else f.pointer(ending, kind, 42, 36);
}
function assertNoEdit(kind, action, saturated = false) {
  const f = setup(kind, saturated), control = setup(kind, saturated), before = f.doc();
  action(f);
  assert.deepEqual(f.doc(), before, 'Document is unchanged/restored');
  assert.equal(f.get('redo').disabled, control.get('redo').disabled, 'Existing Redo remains available');
  assert.deepEqual(timeline(f), timeline(control), 'Both complete history stacks remain equivalent');
  if (!saturated) assert.equal(f.doc().artboards[0].objects.length, 2, 'Original Redo restores the rectangle');
}

for (const kind of ['object', 'guide']) {
  test(`${kind}: pointerdown preserves Redo before completion`, () => {
    const f = setup(kind), before = f.doc();
    f.pointer('pointerdown', kind);
    assert.equal(f.get('redo').disabled, false);
    f.pointer('pointercancel', kind);
    assert.deepEqual(f.doc(), before);
  });
  test(`${kind}: selection-only click preserves document and history`, () => {
    assertNoEdit(kind, f => {
      // Layer selection is also outside serialized document state.
      if (kind === 'guide') f.get('layers').children[0].click();
      f.pointer('pointerdown', kind);
      f.pointer('pointerup', kind);
      assert.equal(f.get('selection-type').textContent, kind === 'object' ? '文字' : '未選択');
    });
  });
  test(`${kind}: drag returning to origin preserves history`, () => {
    assertNoEdit(kind, f => {
      f.pointer('pointerdown', kind);
      f.pointer('pointermove', kind, 42, 36);
      f.pointer('pointermove', kind, kind === 'guide' ? 105 : 30, kind === 'guide' ? 80 : 25);
      f.pointer('pointerup', kind);
    });
  });
  test(`${kind}: rounded movement with no document change preserves history`, () => {
    assertNoEdit(kind, f => {
      f.pointer('pointerdown', kind, 105, 80);
      // Guides use the absolute pointer position; objects use displacement.
      f.pointer('pointermove', kind, 105.001, 80.001);
      f.pointer('pointerup', kind, 105.001, 80.001);
    });
  });
  for (const ending of ['pointercancel', 'Escape']) for (const moved of [false, true]) {
    test(`${kind}: ${ending} ${moved ? 'after movement' : 'without movement'} restores both stacks`, () => {
      assertNoEdit(kind, f => {
        f.pointer('pointerdown', kind);
        if (moved) f.pointer('pointermove', kind, 42, 36);
        finish(f, ending, kind);
        // A later pointerup/capture-loss notification must not commit again.
        f.pointer('pointerup', kind); f.loseCapture();
      });
    });
  }
  test(`${kind}: capture loss without movement preserves history`, () => {
    assertNoEdit(kind, f => { f.pointer('pointerdown', kind); f.loseCapture(); });
  });
  for (const ending of ['pointerup', 'lostpointercapture']) {
    test(`${kind}: changed drag completed by ${ending} commits exactly once`, () => {
      const f = setup(kind), before = f.doc();
      f.pointer('pointerdown', kind);
      f.pointer('pointermove', kind, 36, 30); f.pointer('pointermove', kind, 42, 36);
      finish(f, ending, kind);
      const after = f.doc();
      assert.notDeepEqual(after, before);
      assert.equal(f.get('redo').disabled, true, 'A genuine edit clears the previous Redo');
      f.pointer('pointerup', kind); f.loseCapture();
      f.get('undo').click(); assert.deepEqual(f.doc(), before, 'One Undo restores original document');
      f.get('redo').click(); assert.deepEqual(f.doc(), after, 'Redo restores the new edit');
      assert.equal(f.doc().artboards[0].objects.length, 1, 'Discarded rectangle does not return');
      assert.equal(walk(f, 'undo').length, kind === 'object' ? 2 : 3, 'Exactly one history entry was committed');
    });
  }
  for (const ending of ['pointerup', 'pointercancel', 'Escape']) {
    test(`${kind}: ${ending} with no edit preserves all 60 retained entries`, () => {
      assertNoEdit(kind, f => { f.pointer('pointerdown', kind); finish(f, ending, kind); }, true);
    });
  }
  test(`${kind}: genuine edit still caps history at 60 entries`, () => {
    const f = setup(kind, true), before = f.doc();
    f.pointer('pointerdown', kind); f.pointer('pointermove', kind, 42, 36); f.pointer('pointerup', kind);
    const after = f.doc(); assert.notDeepEqual(after, before);
    f.get('undo').click(); assert.deepEqual(f.doc(), before);
    f.get('redo').click(); assert.deepEqual(f.doc(), after);
    assert.equal(walk(f, 'undo').length, 60);
  });
}

test('ordinary add and numeric edit still clear Redo and round-trip', () => {
  for (const change of [f => f.get('add-text').click(), f => {
    f.get('layers').children[0].click(); f.get('object-x').value = '44'; f.get('object-x').dispatch('change');
  }]) {
    const f = setup(), before = f.doc(); change(f); const after = f.doc();
    assert.notDeepEqual(after, before); assert.equal(f.get('redo').disabled, true);
    f.get('undo').click(); assert.deepEqual(f.doc(), before);
    f.get('redo').click(); assert.deepEqual(f.doc(), after);
  }
});

test('background and layer selection preserve Redo', () => {
  assertNoEdit('object', f => {
    f.get('layers').children[0].click();
    f.get('canvas').dispatch('pointerdown', { pointerId: 1, button: 0, clientX: 180, clientY: 250 });
    f.get('canvas').dispatch('pointerup', { pointerId: 1 });
  });
});

test('reviewer sequence: held object Ctrl+Z then pointermove', () => {
  const f = setup(); // Add text, add rectangle, Undo.
  f.pointer('pointerdown', 'object');
  f.shortcut('undo');
  assert.doesNotThrow(() => f.pointer('pointermove', 'object', 42, 36));
});

const historyRoutes = [
  { name: 'Ctrl+Z', direction: 'undo', run: f => f.shortcut('undo') },
  { name: 'Meta+Z', direction: 'undo', run: f => f.shortcut('undo', true) },
  { name: 'Ctrl+Shift+Z', direction: 'redo', run: f => f.shortcut('redo') },
  { name: 'Meta+Shift+Z', direction: 'redo', run: f => f.shortcut('redo', true) },
  { name: 'Undo button', direction: 'undo', run: f => f.get('undo').click() },
  { name: 'Redo button', direction: 'redo', run: f => f.get('redo').click() },
];
function assertSubsequentEditing(f, control) {
  // A new gesture must be admitted after history travel and stale terminal events.
  for (const item of [f, control]) item.get('add-text').click();
  const before = f.doc(); assert.deepEqual(before, control.doc());
  for (const item of [f, control]) {
    item.pointer('pointerdown', 'object'); item.pointer('pointermove', 'object', 42, 36); item.pointer('pointerup', 'object');
  }
  const after = f.doc(); assert.notDeepEqual(after, before); assert.deepEqual(after, control.doc());
  f.get('undo').click(); assert.deepEqual(f.doc(), before);
  f.get('redo').click(); assert.deepEqual(f.doc(), after);
}
for (const kind of ['object', 'guide']) {
  for (const route of historyRoutes) for (const moved of [false, true]) for (const ending of ['pointerup', 'pointercancel']) {
    test(`active history: ${kind} ${route.name}, ${moved ? 'moved' : 'stationary'}, then ${ending}`, () => {
      const f = setup(kind), control = setup(kind);
      route.run(control); const expected = control.doc();
      f.pointer('pointerdown', kind);
      if (moved) f.pointer('pointermove', kind, 42, 36);
      route.run(f);
      assert.doesNotThrow(() => f.pointer('pointermove', kind, 54, 47), 'Stale movement cannot refer to a removed target');
      assert.equal(f.get('canvas').hasPointerCapture(1), false, 'History travel ends capture');
      finish(f, ending, kind); f.loseCapture();
      assert.deepEqual(f.doc(), expected, 'Pending movement is canceled before the requested history travel');
      assert.deepEqual(timeline(f), timeline(control), 'Neither transient movement nor stale completion changes either history stack');
      assertSubsequentEditing(f, control);
    });
  }
  for (const direction of ['undo', 'redo']) for (const ending of ['pointerup', 'pointercancel']) {
    test(`active history: ${kind} unavailable ${direction}, then ${ending}`, () => {
      // Synthetic persisted content starts with empty Undo/Redo stacks, like a reload.
      const initial = setup(kind).doc(), f = fixture(initial), control = fixture(initial);
      for (const item of [f, control]) {
        item.get('edit-guides').checked = kind === 'guide'; item.get('edit-guides').dispatch('change'); item.get('snap').checked = false;
      }
      const before = f.doc();
      f.pointer('pointerdown', kind); f.pointer('pointermove', kind, 42, 36); f.shortcut(direction);
      assert.equal(f.get('canvas').hasPointerCapture(1), false, 'Unavailable history travel still ends the pending gesture immediately');
      f.pointer('pointermove', kind, 54, 47); finish(f, ending, kind); f.loseCapture();
      assert.deepEqual(f.doc(), before, 'Even an unavailable history request cancels the pending edit');
      assert.equal(f.get('canvas').hasPointerCapture(1), false);
      assert.deepEqual(timeline(f), timeline(control));
      assertSubsequentEditing(f, control);
    });
  }
  for (const direction of ['undo', 'redo']) {
    test(`active history: ${kind} ${direction} preserves the 60-entry bound`, () => {
      const f = setup(kind, true), control = setup(kind, true);
      if (direction === 'redo') for (const item of [f, control]) item.get('undo').click();
      control.get(direction).click(); const expected = control.doc();
      f.pointer('pointerdown', kind); f.pointer('pointermove', kind, 42, 36); f.get(direction).click();
      f.pointer('pointercancel', kind); f.loseCapture();
      assert.deepEqual(f.doc(), expected);
      const actual = timeline(f), wanted = timeline(control);
      assert.deepEqual(actual, wanted); assert(actual.undo.length <= 60); assert(actual.redo.length <= 60);
    });
  }
}
