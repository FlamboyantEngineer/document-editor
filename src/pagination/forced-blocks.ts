// The text blocks a page draws on forced lines (DOCE-PAGINATION-11.2): each paragraph, heading and
// code block directly in its content, and each in a table's cells, a list, a quote, a layout
// section's columns, a script's output, an embed or a code figure, and linked code's code, on the
// lines the engine laid it out on with its container. The pages' decorations, the computed lines a
// test compares with, and the layout handed to a viewer or a print all read them from here; that
// layout leaves linked code out, since a static drawing draws it from its markup.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { linkedCodeFigure } from '../layout-engine/blocks/linked-code.js';
import { isContinuationPlaceholder } from '../model/pagination/fragments.js';
import { isContinued } from './block-directions.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';

/** The block types drawn on forced lines. */
const FORCED_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading', 'code_block']);

/** The top-level blocks whose text blocks are drawn on forced lines, laid out with them. */
const NESTED_TYPES: ReadonlySet<string> = new Set([
  'table_figure',
  'table',
  'bullet_list',
  'ordered_list',
  'blockquote',
  'layout_section',
  'script_block',
  'embed',
  'code_figure',
]);

/** A text block of a page and the lines it is drawn on, or why the browser draws it. */
export interface ForcedBlock {
  readonly node: ProseMirrorNode;
  /** Where it is in the pages' document. */
  readonly pos: number;
  /** Its lines; null when the browser draws it on its own lines. */
  readonly table: DrawnLines | null;
  /** A heading's number, drawn before its content. */
  readonly prefix?: string | undefined;
  readonly reason?: string | undefined;
  /** Whether it is inside a top-level block, such as a table cell's paragraph. */
  readonly nested: boolean;
  /**
   * The atom whose view draws the block's lines, for a block laid out as a text block it is not:
   * linked code, whose `node` is then the code block it is laid out as.
   */
  readonly owner?: ProseMirrorNode | undefined;
}

/** Where a page content's child is, and the numbers the pages draw. */
interface ForcedPlace {
  /** Its position in the pages' document. */
  readonly pos: number;
  readonly scope: string | null;
  readonly headings: ReadonlyMap<number, string>;
  /** The numbered paragraphs, which the browser still draws on its own lines. */
  readonly numbered: ReadonlySet<number>;
  /** The words other plugins insert in the blocks, such as a comparison's deleted words. */
  readonly inserted: InsertedTexts;
}

function topLevel(engine: PagesTextEngine, node: ProseMirrorNode, at: ForcedPlace): ForcedBlock {
  const { pos } = at;
  if (at.numbered.has(pos))
    return { node, pos, table: null, reason: 'numbered paragraph', nested: false };
  const prefix =
    node.type.name !== 'heading' || isContinued(node) ? undefined : at.headings.get(pos);
  const inserted = at.inserted.byBlock.get(node);
  const table = engine.lines(node, { scope: at.scope, prefix, inserted });
  if (!table) return { node, pos, table, reason: 'not laid out by the engine', nested: false };
  return { node, pos, table, prefix, nested: false };
}

// Why a text block inside a container is left to the browser before it is laid out: a number the
// browser draws for it, or words inserted in it, which the container is not laid out with.
function nestedRefusal(at: ForcedPlace, node: ProseMirrorNode, pos: number): string | null {
  if (at.numbered.has(pos)) return 'numbered paragraph';
  if (at.headings.has(pos)) return 'numbered heading';
  return at.inserted.byBlock.has(node) ? 'inserted words' : null;
}

// Linked code, drawn by its view on the lines of the code block it is laid out as
// (`linkedCodeFigure`), the lines a container's layout gave that code when it is inside one.
function linkedCode(
  engine: PagesTextEngine,
  owner: ProseMirrorNode,
  at: { pos: number; scope: string | null; nested?: ReadonlyMap<ProseMirrorNode, DrawnLines> },
): ForcedBlock | null {
  const code = linkedCodeFigure(owner)?.code;
  if (!code) return null;
  const nested = Boolean(at.nested);
  const table = (at.nested ? at.nested.get(code) : engine.lines(code, { scope: at.scope })) ?? null;
  const reason = table ? {} : { reason: 'not laid out by the engine' };
  return { node: code, owner, pos: at.pos, table, nested, ...reason };
}

function inside(engine: PagesTextEngine, container: ProseMirrorNode, at: ForcedPlace) {
  const lines = engine.nestedLines(container, at.scope);
  const blocks: ForcedBlock[] = [];
  container.descendants((node, offset) => {
    if (node.type.name === 'linked_code_block') {
      const pos = at.pos + 1 + offset;
      const block = linkedCode(engine, node, { pos, scope: at.scope, nested: lines });
      if (block) blocks.push(block);
      return false;
    }
    if (!FORCED_TYPES.has(node.type.name)) return !node.isTextblock;
    // A split's empty placeholder takes no room on the page (DOCE-PAGINATION-4.3).
    if (isContinuationPlaceholder(node)) return false;
    const pos = at.pos + 1 + offset;
    const reason = nestedRefusal(at, node, pos);
    const table = reason ? null : (lines.get(node) ?? null);
    const why = reason ?? 'not laid out by the engine';
    blocks.push({ node, pos, table, ...(table ? {} : { reason: why }), nested: true });
    return false;
  });
  return blocks;
}

/** The forced blocks of a child of a page's content: itself, or the text blocks inside it. */
export function forcedBlocksOf(
  engine: PagesTextEngine,
  child: ProseMirrorNode,
  at: ForcedPlace,
): ForcedBlock[] {
  const name = child.type.name;
  if (FORCED_TYPES.has(name)) return [topLevel(engine, child, at)];
  if (name === 'linked_code_block') {
    const block = linkedCode(engine, child, at);
    return block ? [block] : [];
  }
  return NESTED_TYPES.has(name) ? inside(engine, child, at) : [];
}
