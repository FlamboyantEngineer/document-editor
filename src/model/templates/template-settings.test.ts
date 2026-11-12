import { describe, expect, it } from 'vitest';
import { type ContentsSettings, mergeTemplateSettings, resolveContentsList } from '../index.js';

const CONTENTS: ContentsSettings = {
  leader: { character: '.', spacing: '2pt' },
  levels: [{ indentation: '0pt' }, { indentation: '12pt', leader: { character: '·' } }],
  kinds: {
    figures: { title: 'Figures', leader: { character: '_' } },
    tables: { levels: [null, { leader: { character: '' } }] },
  },
};

describe('lists of contents per kind', () => {
  it('DOCE-TEMPLATES-10.4 gives a kind its title and each level its leader', () => {
    const toc = resolveContentsList(CONTENTS, 'toc');
    expect(toc.title).toBeNull();
    expect(toc.levels).toHaveLength(6);
    expect(toc.levels.slice(0, 3)).toEqual([
      { indentation: '0pt', leader: '.' },
      { indentation: '12pt', leader: '·' },
      { leader: '.' },
    ]);
    const figures = resolveContentsList(CONTENTS, 'figures');
    expect(figures.title).toBe('Figures');
    expect(figures.levels.map((level) => level.leader).slice(0, 2)).toEqual(['_', '_']);
    expect(resolveContentsList(CONTENTS, 'tables').levels[1]?.leader).toBeNull();
  });

  it('DOCE-TEMPLATES-10.4 draws a dot leader for a template that sets none', () => {
    const list = resolveContentsList(null, 'toc');
    expect(list).toEqual({
      title: null,
      levels: Array.from({ length: 6 }, () => ({ leader: '.' })),
    });
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
    expect(merged.kinds?.figures).toEqual({
      title: 'Figures',
      leader: { character: '_' },
      levels: [{ leader: { character: '-' } }],
    });
  });
});
