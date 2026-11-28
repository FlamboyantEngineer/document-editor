// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { clusterEnd, clusterStart } from './graphemes.js';
import { positionText } from './inline-content.js';

const FAMILY = '👨🏽‍👩🏾‍👧🏿‍👦🏻';
const ACCENTS = `q${'́'.repeat(40)}`;
const FLAGS = '🇫🇷🇩🇪🇨🇦🇯🇵🇧🇷🇮🇹🇪🇸🇳🇴🇸🇪';
const SUBDIVISION = '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
const CONJUNCT = 'क्‍ष'.repeat(6);
// A conjunct carried through halfwidth voiced sound marks, extenders that are not marks.
const HALFWIDTH = `क्${'\uFF9E'.repeat(20)}क`;

const paragraph = (text: string) =>
  documentSchema.node('paragraph', null, [documentSchema.text(text)]);

// Every cluster boundary of a text, by the segmenter over the whole of it.
function boundaries(text: string): number[] {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
  return [...segments.map(({ index }) => index), text.length];
}

describe('grapheme clusters of a block', () => {
  it('DOCE-PAGINATION-7.11 finds clusters longer than any window, as the whole text has them', () => {
    expect(FAMILY.length).toBe(19);
    const node = paragraph(`A${FAMILY}Z`);
    expect(clusterStart(node, 1 + FAMILY.length)).toBe(1);
    expect(clusterEnd(node, 1)).toBe(1 + FAMILY.length);
    const accents = paragraph(`${ACCENTS}${ACCENTS}`);
    expect(clusterEnd(accents, 0)).toBe(41);
    expect(clusterStart(accents, 82)).toBe(41);
    const zalgo = paragraph(`a${'̀'.repeat(300)}b`);
    expect(clusterStart(zalgo, 301)).toBe(0);
    expect(clusterEnd(zalgo, 0)).toBe(301);
  });

  it('DOCE-PAGINATION-7.11 agrees with the whole text at every boundary of mixed clusters', () => {
    const pieces = [FAMILY, ACCENTS, FLAGS, SUBDIVISION, CONJUNCT, HALFWIDTH, 'x', ' ', 'é', '😀'];
    // A fixed pseudo-random sequence of pieces, so a failure repeats.
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647);
    for (let run = 0; run < 20; run += 1) {
      const text = Array.from({ length: 12 }, () => pieces[next() % pieces.length]).join('');
      const node = paragraph(text);
      const all = boundaries(text);
      for (let index = 1; index < all.length; index += 1) {
        expect(clusterStart(node, all[index] ?? 0), text).toBe(all[index - 1]);
        expect(clusterEnd(node, all[index - 1] ?? 0), text).toBe(all[index]);
      }
    }
  });

  it('DOCE-PAGINATION-7.11 pairs a flag counted from the run of indicators before the window', () => {
    // An odd number of indicators before the flags: the window starts inside the run, and the
    // pairs are counted from where the run starts.
    const text = `x🇫${FLAGS}`;
    const node = paragraph(text);
    expect(clusterStart(node, text.length)).toBe(text.length - 2);
    expect(clusterStart(node, text.length - 2)).toBe(text.length - 6);
  });

  it('DOCE-PAGINATION-7.11 reads each position of an inline node as one character', () => {
    const node = documentSchema.node('paragraph', null, [
      documentSchema.text('ab'),
      documentSchema.node('hard_break'),
      documentSchema.text('cd'),
    ]);
    expect(positionText(node, 1, 4)).toBe('b￼c');
    expect(clusterStart(node, 3)).toBe(2);
  });

  it('DOCE-PAGINATION-7.11 reads windows in any order and keeps clusters across formatting marks', () => {
    const node = documentSchema.node('paragraph', null, [
      documentSchema.text('a'),
      documentSchema.text('q', [documentSchema.mark('strong')]),
      documentSchema.text(ACCENTS.slice(1), [documentSchema.mark('em')]),
      documentSchema.node('math_inline', null, [documentSchema.text('x + y')]),
      documentSchema.text('z'),
    ]);
    const end = node.content.size;
    expect(positionText(node, end - 3, end)).toBe('￼￼z');
    expect(clusterEnd(node, 1)).toBe(1 + ACCENTS.length);
    expect(positionText(node, end - 5, end - 2)).toBe('￼￼￼');
    expect(clusterStart(node, 1 + ACCENTS.length)).toBe(1);
    expect(positionText(node, 0, 3)).toBe('aq́');
  });

  it('DOCE-PAGINATION-7.11 stays within its bounds', () => {
    const node = paragraph(`${ACCENTS}`);
    expect(clusterEnd(node, 0, 10)).toBe(10);
    expect(clusterStart(node, 41, 30)).toBe(30);
  });
});
