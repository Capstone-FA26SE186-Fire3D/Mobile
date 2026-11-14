// Learn formatted text (BE #172): runs become styled segments; plain text when runs are absent or malformed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStyle, safeLink, segments } from '../src/features/learn/rich-text.ts';

const palette = {
  ember: 'E', danger: 'D', warning: 'W', success: 'S', info: 'I',
  emberSoft: 'e', dangerSoft: 'd', warningSoft: 'w', successSoft: 's', infoSoft: 'i',
};

test('marks, colours and highlights map to text styles', () => {
  assert.deepEqual(runStyle({ text: 'x', marks: ['bold', 'italic'] }, palette, 'L'), { fontWeight: 'bold', fontStyle: 'italic' });
  assert.deepEqual(runStyle({ text: 'x', marks: ['underline', 'strike'], color: 'danger', highlight: 'warning' }, palette, 'L'), {
    textDecorationLine: 'underline line-through', color: 'D', backgroundColor: 'w',
  });
  assert.deepEqual(runStyle({ text: 'x', color: 'default', highlight: 'default' }, palette, 'L'), {}, 'default is the normal colour');
  assert.deepEqual(runStyle({ text: 'x', color: '#ff0000' }, palette, 'L'), {}, 'colour codes are not tokens');
});

test('only https links open; a link is underlined and coloured unless the run has its own colour', () => {
  assert.equal(safeLink('https://fet3d.io.vn/learn'), 'https://fet3d.io.vn/learn');
  assert.equal(safeLink('http://fet3d.io.vn'), null);
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('https://user:pw@host.vn'), null);
  assert.deepEqual(runStyle({ text: 'x', link: 'https://a.vn' }, palette, 'L'), { textDecorationLine: 'underline', color: 'L' });
  assert.equal(runStyle({ text: 'x', link: 'https://a.vn', color: 'success' }, palette, 'L').color, 'S');
});

test('segments use runs when present, else the plain text', () => {
  const runs = [{ text: 'Không ' }, { text: 'dùng thang máy', marks: ['bold'], color: 'danger' }, { text: '.' }];
  const out = segments(runs, 'Không dùng thang máy.', palette, 'L');
  assert.deepEqual(out.map((s) => s.text).join(''), 'Không dùng thang máy.');
  assert.deepEqual(out[1].style, { fontWeight: 'bold', color: 'D' });
  assert.deepEqual(segments(undefined, 'Chữ thường', palette, 'L'), [{ text: 'Chữ thường', style: {}, link: null }]);
  assert.deepEqual(segments([{ nope: 1 }], 'fallback', palette, 'L'), [{ text: 'fallback', style: {}, link: null }]);
});
