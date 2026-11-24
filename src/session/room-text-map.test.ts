import { Fragment } from 'prosemirror-model';
import { expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { mapRoomText } from './room-text-map.js';

it('DOCE-SESSION-3.11 keeps UTF-16 offsets across emoji and inline objects', () => {
  const equation = documentSchema.node('math_inline', null, documentSchema.text('x^2'));
  const before = 'old😀 ';
  const after = 'longer🙂 ';
  const selected = ' KEEP';
  const previous = Fragment.fromArray([
    documentSchema.text(before),
    equation,
    documentSchema.text(`${selected} before`),
  ]);
  const next = Fragment.fromArray([
    documentSchema.text(after),
    equation.mark([documentSchema.mark('strong')]),
    documentSchema.text(`${selected} here now`, [documentSchema.mark('strong')]),
  ]);
  const map = mapRoomText(previous, next);
  expect(map.map(before.length + 1)).toBe(after.length + 1);
  expect(map.map(before.length + equation.nodeSize + 3)).toBe(after.length + equation.nodeSize + 3);
});

it('DOCE-SESSION-3.11 maps across disjoint replacements around a long repeated run', () => {
  const text = 'a'.repeat(1_500);
  const previous = Fragment.from(documentSchema.text(`${'X'.repeat(16)}${text}${'Y'.repeat(16)}`));
  const next = Fragment.from(documentSchema.text(`${'P'.repeat(19)}${text}${'Q'.repeat(14)}`));
  const map = mapRoomText(previous, next);
  expect(map.map(16)).toBe(19);
  expect(map.map(750)).toBe(753);
  expect(map.map(previous.size)).toBe(next.size);
});

it('DOCE-SESSION-3.11 uses one offset for a run inserted beside the caret', () => {
  const text = 'a'.repeat(1_200);
  const previous = Fragment.from(documentSchema.text(text));
  const next = Fragment.from(documentSchema.text(`12345${text}`));
  expect(mapRoomText(previous, next).map(0)).toBe(5);
});

it('DOCE-SESSION-3.11 keeps the offset within a replacement of the same width', () => {
  const previous = Fragment.from(documentSchema.text('xxStart'));
  const next = Fragment.from(documentSchema.text('zzStart'));
  expect(mapRoomText(previous, next).map(1)).toBe(1);
});
