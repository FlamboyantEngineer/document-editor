// A text block's content as Pretext rich inline items: one run per stretch between hard breaks,
// each item with the content offset it starts at. Each text node is its own item, as Chromium
// rounds each element's piece of a line on its own; Pretext still kerns across same-font items.

import type { RichInlineBox, RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { citationIdentifiers } from '../model/citation-identifiers.js';
import type { AtomPlace } from './atoms.js';
import { type BodyVariables, PAGE_VARIABLES } from './body-variables.js';
import { continueCode, joinCode, markedItem, type OpenCode } from './code-boxes.js';
import { isHidden } from './hidden-suggestions.js';
import type { InsertedText } from './inserted-text.js';
import { type MathLayouts, type MathRecorder, placeMath } from './math-atoms.js';
import { pageBoxWidth } from './page-box.js';
import type { ReservedBox } from './reserved-boxes.js';
import { TEXT_ATOMS, textAtomItem, type TextAtomSource } from './text-atoms.js';
import { type BlockTypography, fontString, type FontStyle, markedFont } from './typography.js';

/** An inline atom's box, in CSS pixels. */
interface InlineAtomSize {
  readonly width: number;
  readonly height: number;
  /** The distance from the box's top to its baseline; the bottom when not given. */
  readonly baseline?: number | undefined;
  /** Whether it is aligned to its line's top or bottom rather than on the baseline. */
  readonly align?: 'top' | 'bottom' | undefined;
  /** Math sized from its layout, unscaled, which the line may scale down (DOCE-PAGINATION-12.10). */
  readonly math?: MathLayouts | undefined;
}

/** Sizes an inline node in its text block and scope, or gives null when it has no size. */
export type MeasureAtom = (node: ProseMirrorNode, place: AtomPlace) => InlineAtomSize | null;

/** One stretch of a block's content between hard breaks. */
export interface TextRun {
  /** The content offset the run starts at. */
  readonly start: number;
  /** The content offset after the run, past the hard break that ends it. */
  readonly end: number;
  /** Whether a hard break ends the run. */
  readonly endsWithBreak: boolean;
  readonly items: readonly (RichInlineItem | RichInlineBox)[];
  /** Each item's content offset; text before the content, such as a heading's number, has -1. */
  readonly offsets: readonly number[];
  /** Each item's box on the line: an atom's size, or text's in another font; null otherwise. */
  readonly atoms: readonly (InlineAtomSize | null)[];
  /** For each item of inserted text (`InsertedText`), its side among the elements there. */
  readonly sides: readonly (number | null)[];
  /**
   * For each item that is the text an inline node shows, as a text atom's or a variable's, the
   * node's size: the page draws it in the node's one element; null for the block's own text.
   */
  readonly nodes: readonly (number | null)[];
}

/** A content range laid out as taking no room, `[from, to)`. */
type HiddenRange = readonly [number, number];

/** The text template variables show, by their keys. */
export type VariableTexts = ReadonlyMap<string, string>;

/** A block's runs, or why its content cannot be laid out. */
type TextRuns =
  | {
      readonly ok: true;
      readonly runs: readonly TextRun[];
      /** The content ranges hidden as suggestions the markup leaves out, in order. */
      readonly hidden: readonly HiddenRange[];
      /** The boxes its page variables are drawn in (`BodyVariables`), in order. */
      readonly boxes: readonly ReservedBox[];
    }
  | { readonly ok: false; readonly reason: string };

/** What a block's runs are built from. */
interface RunInput {
  readonly node: ProseMirrorNode;
  readonly typography: BlockTypography;
  /** Text drawn before the content: in the block's font, or as an item in its own font. */
  readonly prefix?: string | RichInlineItem | undefined;
  /** The width of a box drawn before the content, such as a paragraph's number. */
  readonly lead?: number | undefined;
  /** Gives a host rule's size in place of the engine's own layout. */
  readonly sizeAtom?: MeasureAtom | undefined;
  readonly measureAtom?: MeasureAtom | undefined;
  /** The width of the block's lines, which inline math wider than it is scaled down to. */
  readonly lineWidth?: number | undefined;
  /** Told each math node laid out from its layout, with its box and scale. */
  readonly onMath?: MathRecorder | undefined;
  /** The template section the block is in, which its atoms are measured in. */
  readonly scope?: string | null | undefined;
  /**
   * The text each template variable shows, by its key, where the block is drawn once with known
   * values, such as a section's header or footer.
   */
  readonly variables?: VariableTexts | undefined;
  /**
   * What the variables of a block in a page's body show, where they are not given by `variables`;
   * a block with a variable is refused without either.
   */
  readonly bodyVariables?: BodyVariables | undefined;
  /** The inline atoms laid out as their text (`TEXT_ATOMS` by default), and their numbers. */
  readonly textAtoms?:
    (TextAtomSource & { readonly types?: ReadonlySet<string> | undefined }) | undefined;
  /** The box a text item in another font takes on its line; null when it cannot grow the line. */
  readonly boxOf?: ((font: FontStyle) => InlineAtomSize | null) | undefined;
  /** Text drawn in the block that is not its content, such as a comparison's deleted words. */
  readonly inserted?: readonly InsertedText[] | undefined;
  /** The suggestion mark the markup hides (`hiddenSuggestion`): its content takes no room. */
  readonly hidden?: string | null | undefined;
}

interface Builder {
  items: (RichInlineItem | RichInlineBox)[];
  offsets: number[];
  atoms: (InlineAtomSize | null)[];
  sides: (number | null)[];
  nodes: (number | null)[];
  start: number;
  /** The inline code element the last node is drawn in (`code-boxes.ts`). */
  code: OpenCode | null;
}

const startRun = (start: number): Builder => ({
  items: [],
  offsets: [],
  atoms: [],
  sides: [],
  nodes: [],
  start,
  code: null,
});

// Adds an item; one of a node with marks may continue the code element of the node before it, and
// an item of none, such as an inserted word, which is drawn outside every mark, ends it.
function addText(
  run: Builder,
  {
    item,
    offset,
    box,
    side = null,
    marks = null,
    node = null,
  }: {
    item: RichInlineItem | RichInlineBox;
    offset: number;
    box: InlineAtomSize | null;
    side?: number | null;
    marks?: readonly Mark[] | null;
    node?: number | null;
  },
) {
  run.items.push(item);
  run.offsets.push(offset);
  run.atoms.push(box);
  run.sides.push(side);
  run.nodes.push(node);
  const index = run.items.length - 1;
  const { open, continues } = continueCode(run.code, marks);
  if (continues) joinCode(run.items, { before: run.code?.index ?? null, after: index });
  run.code = open && { ...open, index: 'font' in item ? index : open.index };
}

// Adds the words inserted at an offset, each an item of its own in the block's font, so a line
// that breaks among them breaks between two words, at the space after one (DOCE-PAGINATION-11.11).
function addInserted(run: Builder, inserted: InsertedText, typography: BlockTypography) {
  const font = fontString(typography.font);
  inserted.pieces.forEach((text, index) => {
    const item: RichInlineItem = { text, font };
    addText(run, { item, offset: inserted.offset, box: null, side: inserted.sides[index] ?? 0 });
  });
}

// The box text in its marks' font takes on the line: its own font's, at the inherited line height.
// Subscript and superscript are drawn without growing the line.
function textBox(child: ProseMirrorNode, input: RunInput): InlineAtomSize | null {
  const shifted = child.marks.some((mark) => /^(sub|super)script$/.test(mark.type.name));
  if (shifted || !input.boxOf) return null;
  const font = markedFont(input.typography, child.marks);
  return fontString(font) === fontString(input.typography.font) ? null : input.boxOf(font);
}

function finish(run: Builder, end: number, endsWithBreak: boolean): TextRun {
  return { ...run, end, endsWithBreak };
}

function textItem(child: ProseMirrorNode, typography: BlockTypography): RichInlineItem {
  const font = fontString(markedFont(typography, child.marks));
  return markedItem({ text: child.text ?? child.textContent, font }, child.marks);
}

type AtomItem = { item: RichInlineItem | RichInlineBox; size: InlineAtomSize | null } | string;

// A text atom as the text the page draws in it, in its marks' font, growing its line as their text
// does; a footnote marker's `sup` does not.
function textAtom(child: ProseMirrorNode, input: RunInput): AtomItem {
  const item = textAtomItem(child, input.typography, input.textAtoms ?? {});
  if (!item) return `no text for inline ${child.type.name}`;
  const size = child.type.name === 'footnote_reference' ? null : textBox(child, input);
  return { item: 'font' in item ? markedItem(item, child.marks) : item, size };
}

// Any other inline atom as the box it is measured to take.
function measuredAtom(child: ProseMirrorNode, input: RunInput): AtomItem {
  const place = { parent: input.node, scope: input.scope, width: input.lineWidth };
  let size = input.measureAtom?.(child, place) ?? null;
  if (!size) return `no size for inline ${child.type.name}`;
  if (size.math) size = placedInline(child, size.math, input);
  return { item: { width: size.width }, size };
}

interface InlinePlace {
  readonly child: ProseMirrorNode;
  readonly offset: number;
  readonly input: RunInput;
  readonly boxes: ReservedBox[];
}

// A host rule's box takes precedence over the node's built-in inline layout.
function addInline(run: Builder, at: InlinePlace): string | null {
  const { child, offset, input } = at;
  const place = { parent: input.node, scope: input.scope, width: input.lineWidth };
  const sized = input.sizeAtom?.(child, place);
  if (sized) {
    addText(run, { item: { width: sized.width }, offset, box: sized, marks: child.marks });
    return null;
  }
  if (child.type.name === 'template_variable') return addVariable(run, at);
  return addAtom(run, at);
}

// Adds an inline atom as text or a measured box, or returns why it could not be laid out.
function addAtom(run: Builder, { child, offset, input }: InlinePlace): string | null {
  const name = child.type.name;
  const refused = input.textAtoms?.refused?.get(name);
  if (refused !== undefined) return refused;
  const atom = (input.textAtoms?.types ?? TEXT_ATOMS).has(name)
    ? textAtom(child, input)
    : measuredAtom(child, input);
  if (typeof atom === 'string') return atom;
  const { item, size } = atom;
  const node = 'font' in item ? child.nodeSize : null;
  addText(run, { item, offset, box: size, marks: child.marks, node });
  return null;
}

// Inline math at the scale its line gives it: shrunk only when wider than the whole line.
function placedInline(child: ProseMirrorNode, math: MathLayouts, input: RunInput): InlineAtomSize {
  const placed = placeMath(math, input.lineWidth ?? Number.POSITIVE_INFINITY);
  input.onMath?.(child, placed);
  const { width, ascent, descent } = placed.box;
  return { width, height: ascent + descent, baseline: ascent };
}

// A template variable as the text it shows, unbroken as an atom is, in its marks' font; nothing
// for one that shows none. In a page's body, a page variable takes its box (DOCE-PAGINATION-11.13).
function addVariable(run: Builder, at: InlinePlace): string | null {
  const { child, offset, input } = at;
  const { variables, bodyVariables: body } = input;
  const key = String(child.attrs.variableKey ?? '');
  const font = fontString(markedFont(input.typography, child.marks));
  if (!variables && body && PAGE_VARIABLES.has(key)) {
    const width = pageBoxWidth(body.digits(), font);
    addText(run, { item: { width }, offset, box: null, marks: child.marks });
    at.boxes.push({ from: offset, to: offset + child.nodeSize, width });
    return null;
  }
  // Without either, as where no page variables draw it (a footnote area), the text it holds.
  const value = variables ? variables.get(key) : body?.text(key);
  const text = (variables || body ? value : child.textContent) ?? '';
  // In its marks' font, padded in inline code and growing its line, as their text is.
  const item = text ? markedItem({ text, font, break: 'never' }, child.marks) : { width: 0 };
  const box = text ? textBox(child, input) : null;
  addText(run, { item, offset, box, marks: child.marks, node: child.nodeSize });
  return null;
}

// A fragment after the first of a split block.
const isContinued = (node: ProseMirrorNode) => Number(node.attrs.splitPartIndex ?? 0) > 0;
// A text node's pieces, cut where a citation's identifier starts and ends: each identifier piece
// is one unbreakable item, as the stylesheet keeps it whole (DOCE-REFERENCES-1.13), and is its own
// element on the line, as the identifier's decoration draws it.
function textPieces(
  child: ProseMirrorNode,
  { offset, typography, identifiers, inserted }: PieceInput,
): { item: RichInlineItem; offset: number }[] {
  const item = textItem(child, typography);
  const end = offset + child.nodeSize;
  const inside = identifiers.filter(([from, to]) => from < end && to > offset);
  // Text inserted inside the node is drawn between two of its pieces.
  const between = inserted.filter((at) => at > offset && at < end);
  if (!inside.length && !between.length) return [{ item, offset }];
  const cuts = [...new Set([offset, ...inside.flat(), ...between, end])]
    .filter((cut) => cut >= offset && cut <= end)
    .sort((a, b) => a - b);
  const pieces: { item: RichInlineItem; offset: number }[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const from = cuts[index] ?? offset;
    const to = cuts[index + 1] ?? end;
    const text = item.text.slice(from - offset, to - offset);
    const whole = inside.some(([start, stop]) => start <= from && to <= stop);
    pieces.push({ item: { ...item, text, ...(whole ? { break: 'never' } : {}) }, offset: from });
  }
  return pieces;
}

interface PieceInput {
  readonly offset: number;
  readonly typography: BlockTypography;
  /** The block's citation identifiers, as content ranges. */
  readonly identifiers: readonly (readonly [number, number])[];
  /** The offsets text is inserted at. */
  readonly inserted: readonly number[];
}

// Adds the inserted text at or before an offset that is not added yet, in the run it is drawn in.
function insertedUpTo(input: RunInput) {
  const waiting = (input.inserted ?? []).filter((each) => !each.alone);
  return (run: Builder, at: number) => {
    while (waiting[0] && waiting[0].offset <= at) {
      const next = waiting.shift();
      if (next) addInserted(run, next, input.typography);
    }
  };
}

/** A block's runs: its text and inline atoms between hard breaks, with their content offsets. */
export function buildRuns(input: RunInput): TextRuns {
  const { node, typography, prefix, lead } = input;
  const runs: TextRun[] = [];
  let run = startRun(0);
  if (lead) addText(run, { item: { width: lead }, offset: -1, box: null });
  if (prefix) {
    const item =
      typeof prefix === 'string' ? { text: prefix, font: fontString(typography.font) } : prefix;
    addText(run, { item, offset: -1, box: null });
  }
  let failure: string | null = null;
  const identifiers = citationIdentifiers(node);
  const inserted = [...(input.inserted ?? [])].sort((a, b) => a.offset - b.offset);
  const insert = insertedUpTo({ ...input, inserted });
  // A deleted block's text before the content is on lines of its own.
  for (const before of inserted.filter((each) => each.alone === 'before')) {
    addInserted(run, before, typography);
    runs.push(finish(run, 0, true));
    run = startRun(0);
  }
  const hidden: [number, number][] = [];
  const boxes: ReservedBox[] = [];
  node.forEach((child, offset) => {
    if (failure) return;
    if (isHidden(child, input.hidden)) {
      // Drawn hidden in the code element around it, which it keeps open or ends.
      run.code = continueCode(run.code, child.marks).open;
      const last = hidden.at(-1);
      if (last?.[1] === offset) last[1] = offset + child.nodeSize;
      else hidden.push([offset, offset + child.nodeSize]);
      return;
    }
    if (child.type.name === 'hard_break') {
      // A fragment that continues a split paragraph starts with the break the line before it
      // ended on; the stylesheet hides it, so it starts no line (DOCE-PAGINATION-4.13).
      if (offset === 0 && !run.items.length && isContinued(node)) {
        run = startRun(child.nodeSize);
        return;
      }
      insert(run, offset);
      runs.push(finish(run, offset + child.nodeSize, true));
      run = startRun(offset + child.nodeSize);
    } else if (child.isText) {
      const box = textBox(child, input);
      const at = inserted.map((each) => each.offset);
      for (const piece of textPieces(child, { offset, typography, identifiers, inserted: at })) {
        insert(run, piece.offset);
        addText(run, { ...piece, box, marks: child.marks });
      }
    } else {
      insert(run, offset);
      failure = addInline(run, { child, offset, input, boxes });
    }
  });
  if (failure) return { ok: false, reason: failure };
  const size = node.content.size;
  insert(run, size);
  for (const after of inserted.filter((each) => each.alone === 'after')) {
    runs.push(finish(run, size, true));
    run = startRun(size);
    addInserted(run, after, typography);
  }
  runs.push(finish(run, size, false));
  return { ok: true, runs, hidden, boxes };
}
