import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { contentsTextTypography, contentsTypography } from './contents-typography.js';
import { createTextLayout } from './text-layout.js';

// The fake Canvas advances each character half the font's size and a space a quarter: at the
// base template's 12px, a character is 6px and a space 3px.
const place = {
  width: 200,
  kind: 'toc',
  indentation: 16,
  numberGap: 6,
  leaderGaps: { before: 4, after: 4 },
};

const leveled: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    contents: {
      ...BASE_TEMPLATE.styles?.contents,
      kinds: { toc: { levels: [null, { size: '10px', weight: 700 }] } },
    },
  },
};

beforeEach(() => {
  installFakeCanvas();
});

describe('list of contents rows', () => {
  it('DOCE-PAGINATION-9.13 lays a row out in its level font over the entries’, unset values the paragraph’s', () => {
    expect(contentsTypography({ kind: 'toc', level: 1 }, { template: leveled })).toMatchObject({
      font: { family: 'Arial', size: 12, weight: 400, italic: false },
      leading: 18,
      marginTop: 0,
      marginBottom: 0,
    });
    expect(contentsTypography({ kind: 'toc', level: 2 }, { template: leveled })).toMatchObject({
      font: { family: 'Arial', size: 10, weight: 700 },
      leading: 15,
    });
    const engine = createTextLayout({ template: leveled });
    expect(engine.contentsTextWidth('123', { kind: 'toc', level: 1 })).toBe(18);
    expect(engine.contentsTextWidth('123', { kind: 'toc', level: 2 })).toBe(15);
  });

  it('DOCE-PAGINATION-9.13 wraps the text in the room the number, a one-zero leader and the page leave', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const row = { level: 1, number: '2.1', text: 'aaaa bbbb cccc dddd eeee ffff', page: '12' };
    // The text starts after 16px of indentation, an 18px number and a 6px gap, at 40px; the leader
    // takes at least 6px between its 4px gaps, and the page 12px: 134px are left for the text.
    const layout = engine.layoutContentsRow(row, place);
    if (!layout.ok) throw new Error(layout.reason);
    expect(layout.table.width).toBe(200);
    expect(
      layout.table.lines.map(({ from, to, left, height }) => ({ from, to, left, height })),
    ).toEqual([
      { from: 0, to: 25, left: 40, height: 18 },
      { from: 25, to: 29, left: 40, height: 18 },
    ]);
    expect(layout.number).toEqual({ left: 16, width: 18 });
    expect(layout.leader).toEqual({ left: 178, width: 6 });
    expect(layout.page).toEqual({ left: 188, width: 12 });
  });

  it('DOCE-PAGINATION-9.13 fills a one-line row with its leader, and draws none without a page', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const short = engine.layoutContentsRow({ level: 1, text: 'aaaa', page: '3' }, place);
    if (!short.ok) throw new Error(short.reason);
    expect(short.number).toBeNull();
    expect(short.table.lines).toHaveLength(1);
    expect(short.table.lines[0]?.left).toBe(16);
    // The text takes its own 24px; the leader runs from after it and its gap to the page's gap.
    expect(short.leader).toEqual({ left: 44, width: 146 });
    expect(short.page).toEqual({ left: 194, width: 6 });
    const bare = engine.layoutContentsRow({ level: 1, text: 'aaaa bbbb' }, place);
    if (!bare.ok) throw new Error(bare.reason);
    expect(bare).toMatchObject({ leader: null, page: null });
  });

  it('DOCE-PAGINATION-9.13 draws a separator after the number in place of its gap', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const row = { level: 1, number: '2.1', separator: ' - ', text: 'aaaa', page: '1' };
    const layout = engine.layoutContentsRow(row, place);
    if (!layout.ok) throw new Error(layout.reason);
    expect(layout.number).toEqual({ left: 16, width: 18 });
    expect(layout.separator).toEqual({ left: 34, width: 12 });
    expect(layout.table.lines[0]?.left).toBe(46);
    const plain = engine.layoutContentsRow({ ...row, number: undefined }, place);
    expect(plain).toMatchObject({ separator: null, number: null });
  });

  it('DOCE-PAGINATION-9.13 puts the page right after the text when the level draws no leader', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const noLeader = { ...place, leaderGaps: null };
    const short = engine.layoutContentsRow({ level: 1, text: 'aaaa', page: '12' }, noLeader);
    expect(short).toMatchObject({ leader: null, page: { left: 40, width: 12 } });
    // A long text wraps in the row less the page: 200 - 16 - 12 = 172px.
    const text = Array.from({ length: 8 }, () => 'aaaa').join(' ');
    const long = engine.layoutContentsRow({ level: 1, text, page: '12' }, noLeader);
    if (!long.ok) throw new Error(long.reason);
    expect(long.table.lines.map((line) => line.from)).toEqual([0, 30]);
    expect(long.page).toEqual({ left: 188, width: 12 });
  });

  it('DOCE-PAGINATION-9.13 draws a group heading row bold', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const layout = engine.layoutContentsRow({ level: 1, text: 'Group', heading: true }, place);
    expect(layout).toMatchObject({ ok: true, font: { weight: 700 }, page: null, leader: null });
  });

  it('DOCE-PAGINATION-9.13 refuses a row whose level font is not served', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE, isFontServed: () => false });
    expect(engine.layoutContentsRow({ level: 1, text: 'a', page: '1' }, place)).toEqual({
      ok: false,
      reason: 'font not served: Arial',
    });
  });
});

describe('list of contents title and empty message', () => {
  const titled: TemplateFile = {
    ...BASE_TEMPLATE,
    styles: {
      ...BASE_TEMPLATE.styles,
      paragraph: { ...BASE_TEMPLATE.styles?.paragraph, lineHeight: 1.25 },
      contents: {
        ...BASE_TEMPLATE.styles?.contents,
        kinds: { toc: { title: { size: '20px', italic: true } } },
      },
    },
  };

  it('DOCE-PAGINATION-9.14 lays the title out in its kind’s title font, unset values 16px, bold and upright', () => {
    expect(
      contentsTextTypography({ kind: 'toc', role: 'title' }, { template: BASE_TEMPLATE }),
    ).toMatchObject({
      font: { family: 'Arial', size: 16, weight: 700, italic: false },
      leading: 24,
      align: 'left',
    });
    // The title's own size, at the paragraph's line height as the page content sets it.
    expect(
      contentsTextTypography({ kind: 'toc', role: 'title' }, { template: titled }),
    ).toMatchObject({
      font: { family: 'Arial', size: 20, weight: 700, italic: true },
      leading: 25,
    });
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    // At 16px a character is 8px and a space 4px: "aaaa bbbb" is 72px, and " cccc" would pass 100px.
    const layout = engine.layoutContentsText('aaaa bbbb cccc', {
      width: 100,
      kind: 'toc',
      role: 'title',
    });
    if (!layout.ok) throw new Error(layout.reason);
    expect(
      layout.table.lines.map(({ from, to, left, height }) => ({ from, to, left, height })),
    ).toEqual([
      { from: 0, to: 10, left: 0, height: 24 },
      { from: 10, to: 14, left: 0, height: 24 },
    ]);
  });

  it('DOCE-PAGINATION-9.14 lays the empty message out in the paragraph’s font, italic', () => {
    const engine = createTextLayout({ template: titled });
    const layout = engine.layoutContentsText('None', { width: 100, kind: 'toc', role: 'empty' });
    expect(layout).toMatchObject({
      ok: true,
      font: { family: 'Arial', size: 12, weight: 400, italic: true },
    });
    if (!layout.ok) throw new Error(layout.reason);
    expect(layout.table.lines).toMatchObject([{ from: 0, to: 4, height: 15 }]);
  });

  it('DOCE-PAGINATION-9.14 refuses a title whose font is not served', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE, isFontServed: () => false });
    expect(
      engine.layoutContentsText('Contents', { width: 100, kind: 'toc', role: 'title' }),
    ).toEqual({
      ok: false,
      reason: 'font not served: Arial',
    });
  });
});
