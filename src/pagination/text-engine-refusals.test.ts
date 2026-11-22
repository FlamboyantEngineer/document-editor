// The blocks of the regression set the pages' text layout engine leaves to the DOM (DOCE-LABS-8.11):
// every stored document laid out by the engine block by block, as the pages lay it out, with the
// number of blocks it refuses and why. The counts are pinned: a change that refuses more fails, and
// so does one that refuses fewer, so the pull request that lowers a count writes the new one.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../model/index.js';
import { createPagesTextEngine } from './text-engine.js';

const SET = join(import.meta.dirname, '../../test/fixtures/documents');

const readJson = <T>(dir: string) =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      name: file.slice(0, -'.json'.length),
      value: JSON.parse(readFileSync(join(dir, file), 'utf8')) as T,
    }));

const TEMPLATES = new Map<string, TemplateFile>([
  [BASE_TEMPLATE_ID, BASE_TEMPLATE],
  ...readJson<TemplateFile>(join(SET, 'templates')).map(({ value }) => [value.id, value] as const),
]);

// A stored document's template, resolved on the set's templates over the base template.
function templateOf(file: DocumentFile): TemplateFile {
  const pin = file.template;
  const id = (typeof pin === 'string' ? pin : pin?.id) ?? BASE_TEMPLATE_ID;
  const own = TEMPLATES.get(id) ?? BASE_TEMPLATE;
  return resolveTemplateFile(own, {
    loadTemplate: (each) => TEMPLATES.get(each) ?? null,
    baseTemplateId: BASE_TEMPLATE_ID,
  });
}

/** What the engine leaves to the DOM in a document: how many blocks, and how many for each reason. */
interface Refusals {
  readonly laid: number;
  readonly refused: number;
  readonly reasons: Readonly<Record<string, number>>;
}

// Lays a stored document out block by block, each page section's content blocks in its scope.
function refusalsOf(file: DocumentFile): Refusals {
  const template = templateOf(file);
  const { doc } = readDocumentFile(file, documentSchema);
  const engine = createPagesTextEngine({
    template,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
  });
  engine.number(doc);
  doc.forEach((section) => {
    const scope = (section.attrs.sectionName as string | null | undefined) ?? null;
    section.descendants((node) => {
      if (node.type.name !== 'page_content') return true;
      node.forEach((block) => engine.measureBlock(block, scope));
      return false;
    });
  });
  const { laid, refused, reasons } = engine.stats();
  engine.destroy();
  return { laid, refused, reasons: Object.fromEntries([...reasons].sort()) };
}

// The blocks each document leaves to the DOM today, and why, over the whole set (689 laid, 193
// refused): captions and contents lists wait for thread G, blocks with footnote markers for thread
// Q3. A count may only go down.
const REFUSED_BY_DOCUMENT: Readonly<Record<string, number>> = {
  'caption-numbering': 26,
  'code-block-stress': 7,
  'code-blocks': 4,
  columns: 1,
  'contents-lists': 7,
  'cross-references': 3,
  figures: 4,
  'footnote-heavy': 30,
  'footnotes-in-structures': 4,
  'heading-keep-with-next': 15,
  'inline-geometry': 1,
  'linked-code': 2,
  'long-mixed': 49,
  'mixed-geometry': 2,
  'oversized-blocks': 1,
  'roman-and-alpha-numbering': 1,
  'roman-numbering-coverage': 26,
  'table-both-header-modes': 2,
  'table-long-repeated-header': 1,
  'table-long-single-header': 1,
  'table-merged-cells': 1,
  'table-rich-cells': 3,
  'table-simple': 1,
  'table-wide': 1,
};

const REFUSED_BY_REASON: Readonly<Record<string, number>> = {
  'footnote marker raises its line': 46,
  'not a text block: code_caption': 43,
  'not a text block: figure_caption': 34,
  'not a text block: table_caption': 54,
  'toc_block is not laid out by the engine yet': 16,
};

beforeEach(() => {
  installFakeCanvas();
});

describe('the blocks the pages text layout engine leaves to the DOM', () => {
  const counts = () =>
    readJson<DocumentFile>(SET).map(({ name, value }) => ({ name, ...refusalsOf(value) }));

  it('DOCE-LABS-8.11 refuses no more and no fewer blocks of each document than pinned', () => {
    const all = counts();
    expect(all).toHaveLength(50);
    const refused = Object.fromEntries(
      all.filter(({ refused }) => refused > 0).map(({ name, refused }) => [name, refused]),
    );
    expect(refused).toEqual(REFUSED_BY_DOCUMENT);
    const reasons: Record<string, number> = {};
    for (const each of all)
      for (const [reason, count] of Object.entries(each.reasons))
        reasons[reason] = (reasons[reason] ?? 0) + count;
    expect(reasons).toEqual(REFUSED_BY_REASON);
  });
});
