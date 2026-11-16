import { describe, expect, it } from 'vitest';
import {
  BASE_TEMPLATE,
  contentsListProperties,
  type ContentsSettings,
  mergeTemplateSettings,
  resolveContentsList,
} from '../index.js';

const CONTENTS: ContentsSettings = {
  title: { size: '16pt', weight: 700 },
  entry: { font: 'Georgia', size: '11pt', italic: true },
  padding: { left: '4pt', right: '6pt' },
  leader: { character: '.', spacing: '2pt' },
  levels: [{ indentation: '0pt' }, { indentation: '12pt', leader: { character: '·' } }],
  kinds: {
    figures: {
      customTitle: 'Figures',
      title: { size: '14pt' },
      entry: { size: '10pt' },
      spacing: { top: '8pt', bottom: '4pt' },
      leader: { character: '_', gapBefore: '2pt' },
    },
    tables: { levels: [null, { leader: { character: '' } }] },
    toc: { levels: [{ size: '13pt', weight: 700, italic: false }, { size: '12pt' }] },
  },
};

describe('lists of contents per kind', () => {
  it('DOCE-TEMPLATES-10.4 gives a kind its title and each level its leader', () => {
    const toc = resolveContentsList(CONTENTS, 'toc');
    expect(toc.title).toBeNull();
    expect(toc.levels).toHaveLength(6);
    expect(toc.levels.map((level) => level.leader?.character ?? null)).toEqual([
      '.',
      '·',
      '.',
      '.',
      '.',
      '.',
    ]);
    expect(toc.levels[1]?.indentation).toBe('12pt');
    const figures = resolveContentsList(CONTENTS, 'figures');
    expect(figures.title).toBe('Figures');
    // The kind's leader is over the lists'; a level's own leader is over the kind's.
    expect(figures.levels.map((level) => level.leader?.character).slice(0, 3)).toEqual([
      '_',
      '·',
      '_',
    ]);
    expect(figures.levels[0]?.leader).toEqual({ character: '_', spacing: '2pt', gapBefore: '2pt' });
    expect(resolveContentsList(CONTENTS, 'tables').levels[1]?.leader).toBeNull();
  });

  it('DOCE-TEMPLATES-10.4 draws a dot leader for a template that sets none', () => {
    const list = resolveContentsList(null, 'toc');
    expect(list.title).toBeNull();
    expect(list.levels).toEqual(
      Array.from({ length: 6 }, () => ({ font: {}, leader: { character: '.' } })),
    );
  });

  it('DOCE-TEMPLATES-10.11 gives each kind its own type, padding and spacing over the lists', () => {
    const figures = resolveContentsList(CONTENTS, 'figures');
    expect(figures.titleFont).toEqual({ size: '14pt', weight: 700 });
    expect(figures.entry).toEqual({ font: 'Georgia', size: '10pt', italic: true });
    expect(figures.padding).toEqual({ left: '4pt', right: '6pt' });
    expect(figures.spacing).toEqual({ top: '8pt', bottom: '4pt' });
    const tables = resolveContentsList(CONTENTS, 'tables');
    expect(tables.titleFont).toEqual({ size: '16pt', weight: 700 });
    expect(tables.spacing).toEqual({});
  });

  it('DOCE-TEMPLATES-10.11 sets each level its size and style over the entries', () => {
    const toc = resolveContentsList(CONTENTS, 'toc');
    // An explicit normal weight and an upright style reset the emphasis the entries give.
    expect(toc.levels[0]?.font).toEqual({
      font: 'Georgia',
      size: '13pt',
      weight: 700,
      italic: false,
    });
    expect(toc.levels[1]?.font).toEqual({ font: 'Georgia', size: '12pt', italic: true });
    expect(toc.levels[2]?.font).toEqual({ font: 'Georgia', size: '11pt', italic: true });
  });

  it('DOCE-TEMPLATES-10.5 writes the list and each level as custom properties', () => {
    const { list, levels } = contentsListProperties(
      resolveContentsList(
        {
          ...CONTENTS,
          levels: [
            null,
            { indentation: '12pt', leader: { spacing: '4pt', gapBefore: '1pt', weight: 700 } },
          ],
        },
        'figures',
      ),
    );
    expect(list).toMatchObject({
      '--doc-contents-title-font-size': '14pt',
      '--doc-contents-title-font-weight': '700',
      '--doc-contents-entry-font-size': '10pt',
      '--doc-contents-entry-font-style': 'italic',
      '--doc-contents-padding-left': '4pt',
      '--doc-contents-padding-right': '6pt',
      '--doc-contents-margin-top': '8pt',
      '--doc-contents-margin-bottom': '4pt',
    });
    expect(levels[0]).toMatchObject({
      '--doc-contents-level-font-size': '10pt',
      '--doc-contents-level-leader-spacing': '2pt',
      '--doc-contents-level-leader-gap-before': '2pt',
    });
    expect(levels[0]).not.toHaveProperty('--doc-contents-level-indentation');
    expect(levels[1]).toMatchObject({
      '--doc-contents-level-indentation': '12pt',
      '--doc-contents-level-leader-spacing': '4pt',
      '--doc-contents-level-leader-gap-before': '1pt',
      '--doc-contents-level-leader-font-weight': '700',
    });
    expect(levels[1]).not.toHaveProperty('--doc-contents-level-leader-gap-after');
  });

  it('DOCE-TEMPLATES-10.5 leaves out values that are not of their kind', () => {
    const stored = JSON.parse(
      '{ "leader": { "spacing": "1px;" }, "levels": [{ "indentation": "1em;", "size": "x}" }] }',
    ) as ContentsSettings;
    const { list, levels } = contentsListProperties(resolveContentsList(stored, 'toc'));
    for (const [name, value] of [...Object.entries(list), ...Object.entries(levels[0] ?? {})]) {
      expect(`${name}: ${value}`).not.toMatch(/[;{}]/);
    }
    expect(levels[0]).not.toHaveProperty('--doc-contents-level-indentation');
  });

  it('DOCE-TEMPLATES-10.11 nests the base template levels and keeps leader gaps', () => {
    const toc = resolveContentsList(BASE_TEMPLATE.styles?.contents, 'toc');
    const indents = toc.levels.map((level) => Number.parseFloat(String(level.indentation)));
    expect(indents).toEqual([...indents].sort((a, b) => a - b));
    expect(new Set(indents).size).toBe(6);
    expect(toc.levels[0]?.leader).toMatchObject({ gapBefore: '3pt', gapAfter: '3pt' });
  });

  it('DOCE-FORMAT-3.1 merges inherited levels by their place', () => {
    const merged = mergeTemplateSettings<ContentsSettings>(CONTENTS, {
      levels: [null, { indentation: '20pt' }],
      kinds: { figures: { levels: [{ leader: { character: '-' } }] } },
    });
    expect(merged.levels).toEqual([
      { indentation: '0pt' },
      { indentation: '20pt', leader: { character: '·' } },
    ]);
    expect(merged.kinds?.figures).toMatchObject({
      customTitle: 'Figures',
      leader: { character: '_', gapBefore: '2pt' },
      levels: [{ leader: { character: '-' } }],
    });
  });
});
