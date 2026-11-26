// New figures at the template's width: a figure the writer inserts, pastes or uploads at its
// image's natural size takes its section's default figure width (`styles.figure.defaultWidth`),
// its height in the image's proportions (`newFigureSize`).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import {
  findTemplateSection,
  lengthToCssPx,
  sectionAt,
  type TemplateFile,
  templateScopeStyles,
} from '../model/index.js';
import { createEmptySectionRemoval } from './section-insertion.js';

/** How `createFigureDefaults` finds the template. */
interface FigureDefaultsOptions {
  readonly template: () => TemplateFile;
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

/**
 * Holds the template new figures take their size from (`newFigureSize`). Every figure is made with
 * a size (DOCE-SCHEMA-3.14), so none is given one afterwards.
 */
export function createFigureDefaults({ template }: FigureDefaultsOptions): Plugin {
  return new Plugin({
    key: figureDefaultsKey,
    state: { init: () => template, apply: (_tr, value) => value },
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
