// How a block of a version reads for a comparison: its text, the text its writer wrote apart from
// what the document generates (a reference's text, a variable's value, a script's output, a
// footnote's number), the targets its links and references point to, its formatting and the
// containers it sits in (lists, tables, quotes). Each is compared on its own, so a changed target,
// a changed container and a generated value that changed alone are told apart from an edit.

import type { Mark, Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { isStructureNode } from '../model/schema/document-structure.js';

/** How the versions' suggestions count: as if every one were rejected, or accepted. */
export type CompareSuggestions = 'rejected' | 'accepted';

/** What a block reads as, from a position. */
export interface VersionBlockReading {
  readonly text: string;
  /** Each character of `text`'s position in the document. */
  readonly positions: number[];
  /** The text with each run the document generates as one placeholder. */
  readonly authored: string;
  /** The block's attributes and its runs of text by their marks, targets and review marks aside. */
  readonly format: string;
  /** Where its links point, in order. */
  readonly links: string;
  /** What its references cite, in order. */
  readonly references: string;
  /** The values the document generates in it: generated text and attributes. */
  readonly generated: string;
}

// The attributes that say where a block is or who wrote it, not how it looks.
const VOLATILE_ATTRS = new Set([
  'dataId',
  'dataAuthor',
  'dataAiSession',
  'splitPartIndex',
  'suggestionSplitKind',
  'suggestionSplitId',
  'orphanedListContinuation',
  'continuationPlaceholder',
]);

// The attributes the document generates: numbers, rendered output, layout ranges and status.
const GENERATED_ATTRS = new Set([
  'footnoteNumber',
  'renderedHtml',
  'renderedAt',
  'provenance',
  'signatures',
  'entryStart',
  'entryEnd',
  'codeBlockContinued',
]);

// The marks that record a review rather than formatting.
const REVIEW_MARKS = new Set(['comment_highlight', 'insertion', 'deletion', 'contributor']);

// A reference's attributes that say how it shows or whether it resolved, not what it cites.
const REFERENCE_STATUS = new Set(['broken', 'referenceBaseline', 'libraryLabel']);

// The inline nodes whose text the document fills in.
const GENERATED_INLINE = new Set(['template_variable']);

// The containers whose content the document generates.
const GENERATED_CONTAINERS = new Set(['script_block']);

const PLACEHOLDER = '�';

function attrsOf(node: { readonly attrs: Readonly<Record<string, unknown>> }, generated = false) {
  return Object.entries(node.attrs).filter(
    ([name]) => !VOLATILE_ATTRS.has(name) && GENERATED_ATTRS.has(name) === generated,
  );
}

const attrsFormat = (node: ProseMirrorNode) => `${node.type.name}${JSON.stringify(attrsOf(node))}`;

// A run's formatting by its marks; a link or a reference counts by its kind, its target aside.
function marksFormat(marks: readonly Mark[]): string {
  return marks
    .filter((mark) => !REVIEW_MARKS.has(mark.type.name))
    .map((mark) =>
      mark.type.name === 'link' || mark.type.name === 'reference'
        ? mark.type.name
        : `${mark.type.name}${JSON.stringify(mark.attrs)}`,
    )
    .join(',');
}

function targetOf(marks: readonly Mark[], name: string): string | null {
  const mark = marks.find((each) => each.type.name === name);
  if (!mark) return null;
  if (name === 'link') return `${String(mark.attrs.href)} ${String(mark.attrs.target)}`;
  return JSON.stringify(Object.entries(mark.attrs).filter(([attr]) => !REFERENCE_STATUS.has(attr)));
}

// Whether a suggestion leaves the text out: an insertion rejected, or a deletion accepted.
const isLeftOut = (node: ProseMirrorNode, suggestions: CompareSuggestions) =>
  node.marks.some(
    (mark) => mark.type.name === (suggestions === 'rejected' ? 'insertion' : 'deletion'),
  );

// Whether a run's text is generated: a reference's text, or a variable's value.
const isGeneratedRun = (node: ProseMirrorNode) =>
  GENERATED_INLINE.has(node.type.name) ||
  (node.isText && node.marks.some((mark) => mark.type.name === 'reference'));

// The targets of runs in order, each once for a run of text under one target.
function addTarget(targets: string[], target: string | null) {
  if (target !== null && targets.at(-1) !== target) targets.push(target);
}

/**
 * A text block's or leaf block's reading, from its position. In a container whose content the
 * document generates, all its text and formatting count as generated.
 */
export function readVersionBlock(
  node: ProseMirrorNode,
  {
    pos,
    suggestions,
    generated,
  }: { pos: number; suggestions: CompareSuggestions; generated: boolean },
): VersionBlockReading {
  const positions: number[] = [];
  const runs: { format: string; length: number }[] = [];
  const links: string[] = [];
  const references: string[] = [];
  const values: string[] = [JSON.stringify(attrsOf(node, true))];
  let text = '';
  let authored = '';
  node.forEach((child, offset) => {
    if (isLeftOut(child, suggestions)) return;
    const value = child.isText ? (child.text ?? '') : child.isLeaf ? '￼' : child.textContent;
    const format = marksFormat(child.marks) + (child.isText ? '' : attrsFormat(child));
    const last = runs.at(-1);
    if (last?.format === format) last.length += value.length;
    else runs.push({ format, length: value.length });
    addTarget(links, targetOf(child.marks, 'link'));
    addTarget(references, targetOf(child.marks, 'reference'));
    if (!child.isText) values.push(JSON.stringify(attrsOf(child, true)));
    if (isGeneratedRun(child)) {
      values.push(value);
      if (!authored.endsWith(PLACEHOLDER)) authored += PLACEHOLDER;
    } else authored += value;
    for (let index = 0; index < value.length; index += 1) positions.push(pos + 1 + offset + index);
    text += value;
  });
  const format =
    attrsFormat(node) + runs.map((run) => `|${String(run.length)}:${run.format}`).join('');
  if (generated) {
    return {
      text,
      positions,
      authored: '',
      format: '',
      links: '',
      references: '',
      generated: text + format,
    };
  }
  return {
    text,
    positions,
    authored,
    format,
    links: links.join('\n'),
    references: references.join('\n'),
    generated: values.join(''),
  };
}

/**
 * The containers a block sits in, outermost first, by their kind and attributes, the document's
 * sections and regions aside; and whether one of them holds content the document generates.
 */
export function containersOf($pos: ResolvedPos): { container: string; generated: boolean } {
  const kept: string[] = [];
  let generated = false;
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    if (isStructureNode(node)) continue;
    generated ||= GENERATED_CONTAINERS.has(node.type.name);
    kept.push(attrsFormat(node));
  }
  return { container: kept.join('>'), generated };
}
