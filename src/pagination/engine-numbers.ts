// The numbers the pages draw from the layout engine (DOCE-PAGINATION-11.9): behind the
// `textLayout: 'pretext'` option, each page skips its style and layout while off screen
// (`content-visibility: auto`), which scopes CSS counters to it, so the heading, caption and
// equation numbers counted across the document would start again on every page. The pages draw the
// numbers the engine laid them out with instead, on every page, drawn on forced lines or not.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { blockNumbers } from '../layout-engine/blocks/numbers.js';
import { DEFAULT_CONTENTS_KINDS } from '../model/contents/contents-kinds.js';
import { catalogDocument } from '../model/contents/document-catalog.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { CAPTION_HOLDER_TYPES, isCaptionNode } from '../model/schema/caption-content.js';
import { isContinued } from './forced-lines.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** A document's object numbers, found again in its pages by element id and order. */
interface ObjectNumbers {
  /** Each shown caption's label with its separator, by the id of the object it captions. */
  readonly captions: ReadonlyMap<string, string>;
  /** Each display equation's number, in document order. */
  readonly equations: readonly string[];
}

const EQUATIONS = { equations: DEFAULT_CONTENTS_KINDS.equations };

const idOf = (node: ProseMirrorNode | null | undefined) => {
  const id = node?.attrs.dataId as unknown;
  return typeof id === 'string' && id ? id : null;
};

// The id a caption is found by: linked code's own, a figure's, or that of the table or code its
// holder holds after it.
function captionKey(node: ProseMirrorNode, parent: ProseMirrorNode | null): string | null {
  if (node.type.name === 'linked_code_block') return idOf(node);
  if (parent && CAPTION_HOLDER_TYPES.has(parent.type.name)) return idOf(parent.maybeChild(1));
  return idOf(parent);
}

/** The caption labels and equation numbers of a canonical document under its template. */
export function objectNumbers(doc: ProseMirrorNode, template: TemplateFile): ObjectNumbers {
  const numbers = blockNumbers(doc, template);
  const captions = new Map<string, string>();
  doc.descendants((node, _pos, parent) => {
    const label = numbers.labelOf(node);
    const key = label === undefined ? null : captionKey(node, parent);
    if (key && label !== undefined && !captions.has(key)) captions.set(key, label);
    return true;
  });
  const entries = catalogDocument(doc, template, EQUATIONS).equations ?? [];
  const equations = entries.map((entry) => entry.number);
  return { captions, equations };
}

const css = (value: string) => `"${value.replace(/["\\]/gu, (char) => `\\${char}`)}"`;

// The decorations drawing a page document's numbers: a heading's as `data-number`, a caption's and
// an equation's as `--de-number`, which the stylesheet's generated content reads. Each says its
// number in its spec, for what draws the pages without a view (`pagesLayout`).
function numberDecorations(
  doc: ProseMirrorNode,
  headings: ReadonlyMap<number, string>,
  objects: ObjectNumbers,
): DecorationSet {
  const found: Decoration[] = [];
  let equation = 0;
  const number = (pos: number, node: ProseMirrorNode, value: string) =>
    found.push(
      Decoration.node(
        pos,
        pos + node.nodeSize,
        { style: `--de-number: ${css(value)}` },
        { number: value, heading: false },
      ),
    );
  doc.descendants((node, pos, parent) => {
    if (node.type.name === 'heading') {
      const value = isContinued(node) ? '' : (headings.get(pos) ?? '');
      found.push(
        Decoration.node(
          pos,
          pos + node.nodeSize,
          { 'data-number': value },
          { number: value, heading: true },
        ),
      );
      return false;
    }
    if (node.type.name === 'math_display') {
      const value = objects.equations[equation];
      equation += 1;
      if (value) number(pos, node, value);
      return false;
    }
    const caption = isCaptionNode(node) || node.type.name === 'linked_code_block';
    const key = caption ? captionKey(node, parent) : null;
    const label = key ? objects.captions.get(key) : undefined;
    if (label) number(pos, node, label);
    return !node.isTextblock;
  });
  return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
}

// Whether a step only edits text inside a textblock that carries no number, as typing does: the
// numbers stay, and the decorations only move.
function keepsNumbers(tr: Transaction, index: number): boolean {
  const step = tr.steps[index];
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return true;
  if (!(step instanceof ReplaceStep)) return false;
  const { from, to, slice } = step;
  let inline = true;
  slice.content.forEach((node) => (inline &&= node.isInline));
  if (!inline || slice.openStart || slice.openEnd) return false;
  const doc = tr.docs[index] as ProseMirrorNode;
  const start = doc.resolve(from);
  const parent = start.parent;
  if (!parent.isTextblock || start.end() < to) return false;
  return parent.type.name !== 'heading' && !isCaptionNode(parent);
}

/** Whether a transaction keeps every number, so the drawn ones only move with it. */
export const keepsAllNumbers = (tr: Transaction) =>
  tr.steps.every((_step, index) => keepsNumbers(tr, index));

/** The engine numbers' key: its state is the decorations drawing them. */
export const engineNumbersKey = new PluginKey<DecorationSet>('engine-numbers');

/** What the numbers are read from: the engine, once loaded, and the canonical document. */
interface EngineNumbersSource {
  readonly engine: () => PagesTextEngine | null;
  readonly canonical: () => ProseMirrorNode;
}

/** Draws the engine's heading, caption and equation numbers on every page. */
export function engineNumbers(source: EngineNumbersSource): Plugin<DecorationSet> {
  let engine: PagesTextEngine | null = null;
  const build = (doc: ProseMirrorNode) => {
    engine = source.engine();
    if (!engine) return DecorationSet.empty;
    const objects = objectNumbers(source.canonical(), engine.template);
    return numberDecorations(doc, engine.numbering(doc).headings, objects);
  };
  return new Plugin<DecorationSet>({
    key: engineNumbersKey,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, set) => {
        if (source.engine() !== engine) return build(tr.doc);
        if (!tr.docChanged) return set;
        return keepsAllNumbers(tr) ? set.map(tr.mapping, tr.doc) : build(tr.doc);
      },
    },
    props: { decorations: (state) => engineNumbersKey.getState(state) },
  });
}
