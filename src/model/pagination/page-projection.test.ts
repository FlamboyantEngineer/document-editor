import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  continuesFragment,
  FRAGMENT_RULES,
  joinDocumentPages,
  projectDocument,
  repaginate,
} from '../index.js';

type Attrs = Record<string, unknown>;
const { nodes } = documentSchema;

function create(name: string, attrs: Attrs | null, content?: Node[] | string): Node {
  const type = nodes[name];
  if (!type) throw new Error(name);
  const children = typeof content === 'string' ? [documentSchema.text(content)] : content;
  return type.create(attrs, children);
}

const reference = (id: string) => create('footnote_reference', { footnoteId: id });
const entry = (id: string, text: string) => create('footnote_entry', { footnoteId: id }, text);
const paragraph = (attrs: Attrs | null, ...content: (Node | string)[]) =>
  create(
    'paragraph',
    attrs,
    content.map((part) => (typeof part === 'string' ? documentSchema.text(part) : part)),
  );

function captionedFigure(
  kind: 'code' | 'table',
  part: number | null,
  text: string,
  id: string | null,
): Node {
  const continued = part !== null && part > 0;
  const caption = create(
    `${kind}_caption`,
    continued ? { continuedText: 'Caption' } : null,
    continued ? undefined : 'Caption',
  );
  const attrs = { dataId: id, splitPartIndex: part };
  const object =
    kind === 'code'
      ? create(
          'code_block',
          {
            ...attrs,
            codeBlockContinued: continued,
            codeLineStart: (part ?? 0) + 1,
          },
          text,
        )
      : create(
          'table',
          attrs,
          text
            .split('\n')
            .map((line) =>
              create('table_row', null, [create('table_cell', null, [paragraph(null, line)])]),
            ),
        );
  return create(`${kind}_figure`, { splitPartIndex: part }, [caption, object]);
}

function page(blocks: Node[], entries: Node[] = []): Node {
  return create('page', null, [
    create('page_header', null),
    create('page_content', null, blocks),
    create('page_footnotes', null, entries),
    create('page_footer', null),
  ]);
}

const section = (...pages: Node[]) => create('page_section', { sectionName: 'Body' }, pages);
const doc = (...sections: Node[]) => create('doc', null, sections);

// The position in a document just before the first occurrence of some text.
function positionOf(document: Node, text: string): number {
  let found = -1;
  document.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) found = pos + index;
    return false;
  });
  return found;
}

const textAfter = (document: Node, pos: number) => document.textBetween(pos, pos + 4);
const contentOf = (paged: Node, sectionIndex = 0) =>
  [...Array(paged.child(sectionIndex).childCount).keys()].map(
    (index) => paged.child(sectionIndex).child(index).child(1).textContent,
  );

const head = paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Split ');
const tail = paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'across', reference('f2'));
const paged = doc(
  section(
    page([paragraph({ dataId: 'p0' }, 'Lead', reference('f1')), head], [entry('f1', 'One')]),
    page([tail, paragraph({ dataId: 'p2' }, 'Last')], [entry('f2', 'Two')]),
  ),
);

describe('page projection', () => {
  it('DOCE-PAGINATION-6.1 joins each section onto one page by steps that map its text', () => {
    const tr = joinDocumentPages(paged);
    const whole = tr.doc;
    expect(whole.child(0).childCount).toBe(1);
    expect(contentOf(whole)).toEqual(['LeadSplit acrossLast']);
    expect(whole.child(0).child(0).child(2).childCount).toBe(2);
    expect(whole.child(0).child(0).child(1).child(1).attrs.splitPartIndex).toBeNull();
    const across = positionOf(paged, 'across');
    expect(textAfter(whole, tr.mapping.map(across))).toBe('acro');
  });

  it.each(['code', 'table'] as const)(
    'DOCE-PAGINATION-1.2 DOCE-PAGINATION-6.1 joins three captioned %s fragments nested in a quote',
    (kind) => {
      const figure = (part: number | null, text: string, id: string | null = 'object') =>
        captionedFigure(kind, part, text, id);
      const quote = (part: number | null, child: Node) =>
        create('blockquote', { dataId: 'quote', splitPartIndex: part }, [child]);
      const after = paragraph(null, 'Text after the figure');
      const heading = quote(0, figure(0, 'First'));
      const middle = quote(1, figure(1, 'Second'));
      const end = quote(2, figure(2, 'Third'));
      const split = doc(section(page([heading]), page([middle]), page([end, after])));
      const whole = doc(section(page([quote(null, figure(null, 'First\nSecond\nThird')), after])));
      const joined = joinDocumentPages(split);
      expect(joined.doc.eq(whole)).toBe(true);
      for (const text of ['Third', 'Text after the figure']) {
        expect(joined.mapping.map(positionOf(split, text))).toBe(positionOf(whole, text));
      }
      const first = figure(1, 'First');
      expect(continuesFragment(first, figure(2, 'Separate', 'other-object'))).toBe(false);
      expect(continuesFragment(first, figure(2, 'Anonymous', null))).toBe(true);
    },
  );

  it.each(['code', 'table'] as const)(
    'DOCE-PAGINATION-1.2 DOCE-PAGINATION-6.1 joins anonymous %s fragments without joining adjacent figures',
    (kind) => {
      const figure = (part: number | null, text: string) => captionedFigure(kind, part, text, null);
      const nested = (part: number | null, ...children: Node[]) => {
        const attrs = { splitPartIndex: part };
        return create('blockquote', attrs, [create('blockquote', attrs, children)]);
      };
      const after = paragraph(null, 'Text after both figures');
      const split = doc(
        section(
          page([nested(0, figure(0, 'First'))]),
          page([nested(1, figure(1, 'Second'))]),
          page([nested(2, figure(2, 'Third'))]),
          page([nested(3, figure(3, 'Fourth'))]),
          page([nested(4, figure(0, 'Other one'))]),
          page([nested(5, figure(1, 'Other two'))]),
          page([nested(6, figure(2, 'Other three'))]),
          page([nested(7, figure(null, 'Whole figure')), after]),
        ),
      );
      const whole = doc(
        section(
          page([
            nested(
              null,
              figure(null, 'First\nSecond\nThird\nFourth'),
              figure(null, 'Other one\nOther two\nOther three'),
              figure(null, 'Whole figure'),
            ),
            after,
          ]),
        ),
      );
      const joined = joinDocumentPages(split);
      expect(joined.doc.eq(whole)).toBe(true);
      const reverse = joined.mapping.invert();
      const reflow = new Transform(whole);
      repaginate(reflow, split);
      expect(reflow.doc.eq(split)).toBe(true);
      for (const text of [
        'Third',
        'Fourth',
        'Other one',
        'Other three',
        'Whole figure',
        'Text after',
      ]) {
        const projected = positionOf(split, text);
        const canonical = positionOf(whole, text);
        expect(joined.mapping.map(projected)).toBe(canonical);
        expect(reverse.map(canonical)).toBe(projected);
        expect(reflow.mapping.map(canonical)).toBe(projected);
      }
    },
  );

  it.each(['code', 'table'] as const)(
    'DOCE-PAGINATION-1.2 keeps conflicting %s identities apart after an anonymous part',
    (kind) => {
      for (const ids of [
        [null, 'same'],
        ['same', null],
      ] as const) {
        const quote = (part: number, child: Node) =>
          create('blockquote', { splitPartIndex: part }, [child]);
        const split = doc(
          section(
            page([quote(0, captionedFigure(kind, 0, 'First', ids[0]))]),
            page([quote(1, captionedFigure(kind, 1, 'Second', ids[1]))]),
            page([quote(2, captionedFigure(kind, 2, 'Third', 'other'))]),
          ),
        );
        const joined = joinDocumentPages(split).doc;
        const figures = joined.child(0).child(0).child(1).child(0).children;
        expect(figures).toHaveLength(2);
        expect(figures[0]?.lastChild?.attrs.dataId).toBe(ids[0]);
        expect(figures[1]?.lastChild?.attrs.dataId).toBe('other');
        expect(figures[1]?.lastChild?.textContent).toBe('Third');
      }
    },
  );

  it.each([
    { repeat: false, shared: false },
    { repeat: false, shared: true },
    { repeat: true, shared: false },
  ])(
    'DOCE-PAGINATION-1.4 keeps an authored header-shaped row with repeats $repeat and shared node $shared',
    ({ repeat, shared }) => {
      const row = (cell: string, text: string) =>
        create('table_row', null, [create(cell, null, [paragraph(null, text)])]);
      const label = () => row('table_header', 'Label');
      const body = (text: string) => row('table_cell', text);
      const quote = (part: number | null, rows: Node[]) => {
        const attrs = { splitPartIndex: part };
        const continuedText = repeat && part !== null && part > 0 ? '' : null;
        const caption = create('table_caption', { continuedText });
        const table = create('table', attrs, rows);
        return create('blockquote', attrs, [create('table_figure', attrs, [caption, table])]);
      };
      const header = label();
      const authored = shared ? header : label();
      const copies = repeat ? [label()] : [];
      const [one, two, three, four] = [body('One'), body('Two'), body('Three'), body('Four')];
      const split = doc(
        section(
          page([quote(0, [header, one])]),
          page([quote(1, [...copies, two])]),
          page([quote(2, [...copies, authored, three])]),
          page([quote(3, [...copies, four])]),
        ),
      );
      const whole = doc(section(page([quote(null, [header, one, two, authored, three, four])])));
      const joined = joinDocumentPages(split);
      expect(joined.doc.eq(whole)).toBe(true);
      const after = positionOf(split, 'Four');
      expect(joined.mapping.map(after)).toBe(positionOf(whole, 'Four'));
    },
  );

  it('DOCE-PAGINATION-1.7 honors a fragment rule that stops a nested run after the second part', () => {
    const rule = FRAGMENT_RULES.code_figure;
    if (!rule) throw new Error('code figure rule');
    const split = doc(
      section(
        ...['First', 'Second', 'Third'].map((text, part) =>
          page([
            create('blockquote', { splitPartIndex: part }, [
              captionedFigure('code', part, text, null),
            ]),
          ]),
        ),
      ),
    );
    const joined = joinDocumentPages(split, {
      ...FRAGMENT_RULES,
      code_figure: { ...rule, continues: (_previous, next) => next.attrs.splitPartIndex === 1 },
    }).doc;
    const figures = joined.child(0).child(0).child(1).child(0).children;
    expect(figures.map((figure) => figure.lastChild?.textContent)).toEqual([
      'First\nSecond',
      'Third',
    ]);
  });

  it('DOCE-PAGINATION-1.7 continues a nested run when a custom join adds content', () => {
    const rule = FRAGMENT_RULES.paragraph;
    if (!rule) throw new Error('paragraph rule');
    const split = doc(
      section(
        ...['One', 'Two', 'Three'].map((text, part) =>
          page([
            create('blockquote', { splitPartIndex: part }, [
              paragraph({ splitPartIndex: part }, text),
            ]),
          ]),
        ),
      ),
    );
    const joined = joinDocumentPages(split, {
      ...FRAGMENT_RULES,
      paragraph: {
        ...rule,
        join(tr, pos) {
          tr.join(pos);
          tr.insert(pos - 1, documentSchema.text(' / '));
        },
      },
    }).doc;
    const quote = joined.child(0).child(0).child(1).child(0);
    expect(quote.children.map((child) => child.textContent)).toEqual(['One / Two / Three']);
  });

  it('DOCE-PAGINATION-6.2 lays the whole document onto pages with page numbers and footnotes', () => {
    const whole = joinDocumentPages(paged).doc;
    const blocks: Node[] = [];
    whole
      .child(0)
      .child(0)
      .child(1)
      .forEach((block) => blocks.push(block));
    const [lead, split, last] = blocks;
    if (!lead || !split || !last) throw new Error('blocks');
    const projected = projectDocument(whole, [[[lead], [split, last]]]);
    const pages = projected.child(0);
    expect(pages.childCount).toBe(2);
    expect(pages.child(1).child(0).attrs).toMatchObject({ pageNumber: 2, totalPages: 2 });
    expect(pages.child(1).child(3).attrs).toMatchObject({ pageNumber: 2, totalPages: 2 });
    expect(pages.child(1).child(2).firstChild?.attrs).toMatchObject({ footnoteId: 'f2' });
    const perPage = projectDocument(whole, [[[lead], [split, last]]], {
      footnoteNumbering: 'page',
    });
    expect(perPage.child(0).child(1).child(2).firstChild?.attrs.footnoteId).toBe('f2');
    expect(projectDocument(whole, []).child(0).childCount).toBe(1);
  });

  it('DOCE-PAGINATION-6.3 moves a document onto another layout keeping text positions', () => {
    const lead = paragraph({ dataId: 'p0' }, 'Lead');
    const current = doc(
      section(
        page([lead]),
        page([paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Split ')]),
        page([paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'across here')]),
      ),
    );
    const target = doc(
      section(
        page([lead]),
        page([paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Split across ')]),
        page([paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'here')]),
      ),
    );
    const tr = new Transform(current);
    repaginate(tr, target);
    expect(tr.doc.eq(target)).toBe(true);
    expect(textAfter(tr.doc, tr.mapping.map(positionOf(current, 'cross')))).toBe('cros');
    expect(textAfter(tr.doc, tr.mapping.map(positionOf(current, 'here')))).toBe('here');
    expect(tr.doc.child(0).child(0)).toBe(current.child(0).child(0));
  });

  it('DOCE-PAGINATION-6.4 adds and removes pages, and replaces what does not match', () => {
    const one = doc(section(page([paragraph({ dataId: 'p1' }, 'Short')])));
    const two = doc(
      section(
        page([paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Sh')]),
        page([paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'ort')]),
      ),
    );
    const grow = new Transform(one);
    repaginate(grow, two);
    expect(grow.doc.eq(two)).toBe(true);
    expect(textAfter(grow.doc, grow.mapping.map(positionOf(one, 'ort')))).toBe('ort');
    const shrink = new Transform(two);
    repaginate(shrink, one);
    expect(shrink.doc.eq(one)).toBe(true);
    // A code block in its holder after its caption, which a later part repeats as its text.
    const code = (attrs: Attrs, text: string) => {
      const part = attrs.splitPartIndex ?? null;
      const caption =
        Number(part) > 0
          ? create('code_caption', { continuedText: 'Setup' })
          : create('code_caption', null, 'Setup');
      const block = create('code_block', { dataId: 'c1', ...attrs }, text);
      return create('code_figure', { splitPartIndex: part }, [caption, block]);
    };
    const wholeCode = doc(section(page([code({}, 'one\ntwo\nthree')])));
    const splitCode = doc(
      section(
        page([code({ splitPartIndex: 0 }, 'one')]),
        page([
          code({ splitPartIndex: 1, codeBlockContinued: true, codeLineStart: 2 }, 'two\nthree'),
        ]),
      ),
    );
    const resplit = new Transform(wholeCode);
    repaginate(resplit, splitCode);
    expect(resplit.doc.eq(splitCode)).toBe(true);
    expect(textAfter(resplit.doc, resplit.mapping.map(positionOf(wholeCode, 'three')))).toBe(
      'thre',
    );
    const other = doc(section(page([paragraph(null, 'Different')])));
    const replace = new Transform(one);
    repaginate(replace, other);
    expect(replace.doc.eq(other)).toBe(true);
  });
});
