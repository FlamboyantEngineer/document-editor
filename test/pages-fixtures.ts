// Laid-out pages for the tests of what draws them: a pages' document of sections and pages, a text
// layout engine that breaks lines every few characters, and a pages' state drawn on its lines.

import type { Node } from 'prosemirror-model';
import { EditorState, type Plugin } from 'prosemirror-state';
import type { TextLine } from '../src/layout-engine/line-table.js';
import { forcedLines } from '../src/pagination/forced-lines.js';
import { createPageVariables } from '../src/pagination/page-variables.js';
import type { DrawnLines, PagesTextEngine } from '../src/pagination/text-engine-types.js';
import { documentSchema } from './document-markup.js';

/** A node of the document schema. */
export function node(name: string, attrs: Record<string, unknown> | null, content?: Node[]) {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  return type.create(attrs, content);
}

/** What a page's header and footer hold, and the page's number and count they show. */
export interface PageRegions {
  readonly header?: Node[];
  readonly footer?: Node[];
  readonly pageNumber?: number;
  readonly totalPages?: number;
}

/** A page with its regions, numbered as a layout numbers them. */
export function page(blocks: Node[], regions: PageRegions = {}) {
  const numbers = { pageNumber: regions.pageNumber ?? 1, totalPages: regions.totalPages ?? 1 };
  return node('page', null, [
    node('page_header', numbers, regions.header ?? []),
    node('page_content', null, blocks),
    node('page_footnotes', null, []),
    node('page_footer', numbers, regions.footer ?? []),
  ]);
}

/** A pages' document of one section. */
export const pagesDocument = (pages: Node[], sectionName: string | null = null) =>
  node('doc', null, [node('page_section', { sectionName }, pages)]);

/** How the stub engine lays lines out. */
export interface StubEngineOptions {
  /** Characters on a line. */
  readonly perLine?: number;
  readonly left?: number;
  readonly justify?: boolean;
  readonly headings?: ReadonlyMap<number, string>;
}

/** An engine that breaks a block's content every `perLine` characters, each line 10px of 100px. */
export function stubEngine(options: StubEngineOptions = {}): PagesTextEngine {
  const perLine = options.perLine ?? 10;
  return {
    template: {} as PagesTextEngine['template'],
    number: () => undefined,
    numbering: () => ({ headings: options.headings ?? new Map(), paragraphs: new Set() }),
    measureBlock: () => null,
    lines(block) {
      const size = block.content.size;
      const lines: TextLine[] = [];
      for (let from = 0; from < size || lines.length === 0; from += perLine) {
        const to = Math.min(size, from + perLine);
        const end = to < size ? 'wrap' : 'end';
        lines.push({ from, to, width: 10, left: options.left ?? 0, top: 0, height: 20, end });
      }
      const table: DrawnLines = {
        width: 100,
        lines,
        height: lines.length * 20,
        overhead: 0,
        justify: options.justify ?? false,
      };
      return table;
    },
    stats: () => ({ laid: 0, refused: 0, reasons: new Map() }),
    destroy: () => undefined,
  };
}

/** A pages' state drawn on the engine's lines, with page variables, as the pages' view has it. */
export function pagesState(doc: Node, engine: PagesTextEngine | null, plugins: Plugin[] = []) {
  const source = { engine: () => engine, version: () => 0 };
  return EditorState.create({
    doc,
    plugins: [forcedLines(source), createPageVariables({ value: (key) => `<${key}>` }), ...plugins],
  });
}
