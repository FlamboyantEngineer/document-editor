import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { joinDocumentPages, projectDocument, repaginate } from '../index.js';

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

  it('DOCE-PAGINATION-6.2 lays the whole document onto pages with numbers and footnotes', () => {
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
    expect(pages.child(1).child(2).firstChild?.attrs).toMatchObject({
      footnoteId: 'f2',
      footnoteNumber: 2,
    });
    const perPage = projectDocument(whole, [[[lead], [split, last]]], {
      footnoteNumbering: 'page',
    });
    expect(perPage.child(0).child(1).child(2).firstChild?.attrs.footnoteNumber).toBe(1);
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
    const code = (attrs: Attrs, text: string) =>
      create('code_block', { dataId: 'c1', ...attrs }, text);
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
