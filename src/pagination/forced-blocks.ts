// The text blocks a page draws on forced lines (DOCE-PAGINATION-11.2): each paragraph, heading and
// code block directly in its content, and each in a table's cells, a list, a quote, a layout
// section's columns, a script's output, an embed or a code figure, the captions of figures, tables
// and code that the pages show, and linked code's code, on the
// lines the engine laid it out on with its container. The pages' decorations, the computed lines a
// test compares with, and the layout handed to a viewer or a print all read them from here; that
// layout leaves linked code out, since a static drawing draws it from its markup.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { linkedCodeFigure } from '../layout-engine/blocks/linked-code.js';
import type { ParagraphNumber } from '../layout-engine/numbers.js';
import { isContinuationPlaceholder } from '../model/pagination/fragments.js';
import { isContinued } from './block-directions.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';

/** The block types drawn on forced lines. */
const FORCED_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading', 'code_block']);

/** The captions drawn on forced lines, after the label the pages draw before their content. */
const CAPTION_TYPES: ReadonlySet<string> = new Set([
  'figure_caption',
  'table_caption',
  'code_caption',
]);

/** Whether a block is a caption, drawn after its label (`ForcedBlock.prefixed`). */
export const isCaption = (node: ProseMirrorNode) => CAPTION_TYPES.has(node.type.name);

/** The top-level blocks whose text blocks are drawn on forced lines, laid out with them. */
const NESTED_TYPES: ReadonlySet<string> = new Set([
  'figure',
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
  /**
   * Whether the pages draw generated content before the block's content, its first line's indent
   * before it: a heading's number, or a caption's label.
   */
  readonly prefixed?: boolean | undefined;
  readonly reason?: string | undefined;
  /** Whether it is inside a top-level block, such as a table cell's paragraph. */
  readonly nested: boolean;
  /**
   * The atom whose view draws the block's lines, for a block laid out as a text block it is not:
   * linked code, whose `node` is then the code block it is laid out as.
   */
  readonly owner?: ProseMirrorNode | undefined;
  /** For a caption, what holds it with its object, such as a table's or code's holder. */
  readonly holder?: ProseMirrorNode | undefined;
}

/** Where a page content's child is, and the numbers the pages draw. */
interface ForcedPlace {
  /** Its position in the pages' document. */
  readonly pos: number;
  readonly scope: string | null;
  readonly headings: ReadonlyMap<number, string>;
  /** Each numbered paragraph's number, by position. */
  readonly numbered: ReadonlyMap<number, ParagraphNumber>;
  /** The words other plugins insert in the blocks, such as a comparison's deleted words. */
  readonly inserted: InsertedTexts;
  /** The labels the pages' captions show, a split part's copy's among them. */
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  /** The top-level parts of split blocks that a later part continues, by position. */
  readonly continuing?: ReadonlySet<number> | undefined;
}

const continuingKept = new WeakMap<ProseMirrorNode, ReadonlySet<number>>();

// A split block's part, by its element id and part index.
const partKey = (node: ProseMirrorNode) => {
  const id: unknown = node.attrs.dataId;
  return typeof id === 'string' && id
    ? `${id}#${String(Number(node.attrs.splitPartIndex ?? 0))}`
    : null;
};

/**
 * The positions of the parts of split text blocks in a pages' document, at any depth, that a later part
 * continues on the next line (DOCE-PAGINATION-11.2): the part with the same element id and the next
 * part index, unless that part starts at the hard break the split moved to it, which ended this
 * part's last line.
 */
export function continuingParts(doc: ProseMirrorNode): ReadonlySet<number> {
  const found = continuingKept.get(doc);
  if (found) return found;
  const parts = new Map<string, number>();
  const continued = new Set<string>();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const key = partKey(node);
    if (!node.isTextblock || !key) return false;
    parts.set(key, pos);
    const part = Number(node.attrs.splitPartIndex ?? 0);
    if (part > 0 && node.firstChild?.type.name !== 'hard_break')
      continued.add(`${String(node.attrs.dataId)}#${String(part - 1)}`);
    return false;
  });
  const continuing = new Set([...continued].flatMap((key) => parts.get(key) ?? []));
  continuingKept.set(doc, continuing);
  return continuing;
}

const wrappedKept = new WeakMap<DrawnLines, DrawnLines>();

// A part's lines with its last line wrapping, as it does in the whole block, kept by its lines.
function wrappedAtEnd(table: DrawnLines): DrawnLines {
  const last = table.lines.at(-1);
  if (last?.end !== 'end') return table;
  let wrapped = wrappedKept.get(table);
  if (!wrapped) {
    wrapped = { ...table, lines: [...table.lines.slice(0, -1), { ...last, end: 'wrap' }] };
    wrappedKept.set(table, wrapped);
  }
  return wrapped;
}

function topLevel(engine: PagesTextEngine, node: ProseMirrorNode, at: ForcedPlace): ForcedBlock {
  const { pos } = at;
  const prefix =
    node.type.name !== 'heading' || isContinued(node) ? undefined : at.headings.get(pos);
  // A numbered paragraph's number is drawn before its first line, in the box the engine gave it.
  const number = at.numbered.get(pos);
  const inserted = at.inserted.byBlock.get(node);
  const laid = engine.lines(node, { scope: at.scope, prefix, number, inserted });
  if (!laid) return { node, pos, table: laid, reason: 'not laid out by the engine', nested: false };
  // A part a later part continues ends its last line at the page break, where the whole block
  // wraps it: justified and hyphenated as a wrapped line, its height the same.
  const table = at.continuing?.has(pos) ? wrappedAtEnd(laid) : laid;
  return { node, pos, table, prefix, prefixed: Boolean(prefix ?? number), nested: false };
}

// A later part of a split table or code block.
function laterPart(holder: ProseMirrorNode | null): boolean {
  const part: unknown = holder?.attrs.splitPartIndex;
  if (typeof part === 'number' && part > 0) return true;
  return holder?.lastChild?.attrs.codeBlockContinued === true;
}

// Whether the pages draw nothing of a caption: one switched off, on its figure or on the table or
// code it holds, or a later part's that shows no caption, as one opening with a body row.
function hiddenCaption(node: ProseMirrorNode, holder: ProseMirrorNode | null): boolean {
  if (holder?.attrs.captionEnabled === false) return true;
  if (holder?.lastChild?.attrs.captionEnabled === false) return true;
  return laterPart(holder) && typeof node.attrs.continuedText !== 'string';
}

// A caption inside a container, on the lines the container's layout gave it: a later part's shows
// the first part's text and the continued suffix, laid out as text it holds (`LineTable.text`),
// and a label that a line breaks inside or after is drawn in its parts (`LineTable.label`). One
// the pages do not draw is left out.
function caption(
  node: ProseMirrorNode,
  { pos, holder, lines }: { pos: number; holder: ProseMirrorNode | null; lines: NestedLines },
): ForcedBlock | null {
  if (hiddenCaption(node, holder)) return null;
  const table = lines.get(node);
  const held = holder ? { holder } : {};
  if (!table)
    return { node, pos, table: null, reason: 'not laid out by the engine', nested: true, ...held };
  return { node, pos, table, prefixed: true, nested: true, ...held };
}

type NestedLines = ReadonlyMap<ProseMirrorNode, DrawnLines>;

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
  const lines = engine.nestedLines(container, at.scope, {
    labelOf: at.labelOf,
    inserted: at.inserted,
  });
  const blocks: ForcedBlock[] = [];
  container.descendants((node, offset, parent) => {
    if (isCaption(node)) {
      const block = caption(node, { pos: at.pos + 1 + offset, holder: parent, lines });
      if (block) blocks.push(block);
      return false;
    }
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
    const laid = lines.get(node) ?? null;
    // A part a later part continues ends its last line where the whole block wraps it, at any depth.
    const table = laid && at.continuing?.has(pos) ? wrappedAtEnd(laid) : laid;
    const reason = table ? {} : { reason: 'not laid out by the engine' };
    blocks.push({ node, pos, table, ...reason, nested: true });
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
