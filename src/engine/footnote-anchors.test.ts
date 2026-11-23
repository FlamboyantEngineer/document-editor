import { describe, expect, it } from 'vitest';
import { footnotePartLinks } from './footnote-anchors.js';

const marker = (id: string, page: number) => ({ id, marker: true, page });
const entry = (id: string, page: number) => ({ id, marker: false, page });

describe('footnotePartLinks', () => {
  it('DOCE-PAGINATION-13.11 gives a note drawn on a later page its own anchors there', () => {
    expect(
      footnotePartLinks([marker('a', 0), entry('a', 0), marker('a', 1), entry('a', 1)]),
    ).toEqual([
      { anchor: 'fnref-a', href: '#fn-a' },
      { anchor: 'fn-a', href: '#fnref-a' },
      { anchor: 'fnref-a~2', href: '#fn-a~2' },
      { anchor: 'fn-a~2', href: '#fnref-a~2' },
    ]);
  });

  it('DOCE-PAGINATION-13.11 leaves an entry continued on the next page and a second citation unanchored', () => {
    expect(
      footnotePartLinks([marker('a', 0), marker('a', 0), entry('a', 0), entry('a', 1)]),
    ).toEqual([
      { anchor: 'fnref-a', href: '#fn-a' },
      { anchor: null, href: '#fn-a' },
      { anchor: 'fn-a', href: '#fnref-a' },
      { anchor: null, href: null },
    ]);
  });

  it('DOCE-PAGINATION-13.11 links a marker whose page holds no entry to the first entry', () => {
    expect(footnotePartLinks([marker('a', 0), marker('a', 1), entry('a', 2)])).toEqual([
      { anchor: 'fnref-a', href: '#fn-a~3' },
      { anchor: 'fnref-a~2', href: '#fn-a~3' },
      { anchor: 'fn-a~3', href: '#fnref-a' },
    ]);
  });
});
