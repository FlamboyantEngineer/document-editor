// New figures at the template's width: a figure the writer inserts, pastes or uploads at its
// image's natural size takes its section's default figure width (`styles.figure.defaultWidth`),
// its height in the image's proportions (`newFigureSize`); one brought in without a size of its
// own takes the width alone.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  findTemplateSection,
  lengthToCssPx,
  sectionAt,
  type TemplateFile,
  templateScopeStyles,
} from '../model/index.js';
import { createEmptySectionRemoval } from './section-insertion.js';
import { isInlineTextOnly, isLocalEdit, isRemoteTransaction } from './transaction-kind.js';

/** How `createFigureDefaults` finds the template and tells another writer's change. */
interface FigureDefaultsOptions {
  readonly template: () => TemplateFile;
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
}

const figureDefaultsKey = new PluginKey<() => TemplateFile>('figureDefaults');

// The default width of a section's new figures, in pixels; null when the template sets none.
function defaultWidth(template: TemplateFile, doc: ProseMirrorNode, pos: number): number | null {
  const section = sectionAt(doc.resolve(pos));
  const styles = templateScopeStyles(template, findTemplateSection(template, section?.name));
  const width = Number.parseFloat(lengthToCssPx(styles.figure?.defaultWidth) ?? '');
  return width > 0 ? width : null;
}

/**
 * The size a new figure of an image of a natural size takes at a position: its section's default
 * figure width with the height in the image's proportions, or else the natural size; the natural
 * size where the editor follows no template's defaults.
 */
export function newFigureSize(
  state: EditorState,
  pos: number,
  natural: { readonly width: number; readonly height: number },
): { width: number; height: number } {
  const template = figureDefaultsKey.getState(state);
  const width = template ? defaultWidth(template(), state.doc, pos) : null;
  return width === null
    ? { width: natural.width, height: natural.height }
    : { width, height: (natural.height * width) / natural.width };
}

// The range of the document after the change that differs from the one before it, or null.
function changedRange(before: ProseMirrorNode, after: ProseMirrorNode): [number, number] | null {
  const from = before.content.findDiffStart(after.content);
  const end = before.content.findDiffEnd(after.content);
  if (from === null || !end) return null;
  return [Math.min(from, end.b), Math.max(from, end.b)];
}

/**
 * Gives each figure the writer's change brings in without a size its section's default figure
 * width, in the same undo step; another writer's change, and figures with a size, are left as
 * they are.
 */
export function createFigureDefaults({
  template,
  isRemote = isRemoteTransaction,
}: FigureDefaultsOptions): Plugin {
  return new Plugin({
    key: figureDefaultsKey,
    state: { init: () => template, apply: (_tr, value) => value },
    appendTransaction(transactions, before, after) {
      const edits = transactions.filter((tr) => isLocalEdit(tr, isRemote));
      if (edits.length === 0 || edits.every(isInlineTextOnly)) return null;
      const figure = after.schema.nodes.figure;
      if (!figure) return null;
      const range = changedRange(before.doc, after.doc);
      if (!range) return null;
      const { tr } = after;
      after.doc.nodesBetween(range[0], range[1], (node, pos) => {
        if (node.type !== figure) return true;
        const sized = node.attrs.width != null || node.attrs.height != null;
        const width = sized ? null : defaultWidth(template(), after.doc, pos);
        if (width !== null) tr.setNodeMarkup(pos, undefined, { ...node.attrs, width });
        return false;
      });
      return tr.docChanged ? tr : null;
    },
  });
}

/**
 * The plugins an editor of a template's documents follows the template with on the writer's
 * changes: emptied insertable sections taken out (`createEmptySectionRemoval`) and new figures at
 * the default width (`createFigureDefaults`).
 */
export function createTemplateEditDefaults(template: () => TemplateFile): Plugin[] {
  return [createEmptySectionRemoval({ template }), createFigureDefaults({ template })];
}
