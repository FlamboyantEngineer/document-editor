// Aligning the figure or table selected, and resizing the figure selected: a whole-pixel width and
// height, which leaves the fit to the page's width, since a fitted figure takes the page's width
// rather than its own. An object leaving the fit keeps the size it was fitted at.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { keepNodeSelected } from './caption-editing.js';
import { laidOutFigureSize } from './figure-measure.js';
import { nodeAtSelection, storedLayout } from './object-commands.js';
import { laidOutColumnWidths } from './table-laid-out.js';
import { writeColumnWidths } from './table-resize.js';

/** Sets the size of the figure selected, in whole pixels of at least 1; a fitted figure leaves the fit. */
export function setFigureSize(size: { width: number; height: number }): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['figure']);
    const valid = [size.width, size.height].every((side) => Number.isInteger(side) && side >= 1);
    if (!found || !valid) return false;
    const { objectLayout } = found.node.attrs;
    const tr = state.tr.setNodeMarkup(found.pos, undefined, {
      ...found.node.attrs,
      width: size.width,
      height: size.height,
      objectLayout: objectLayout === 'fit-page-width' ? null : objectLayout,
    });
    dispatch?.(keepNodeSelected(tr, state));
    return true;
  };
}

// An object leaving the fit to the page's width keeps the size it was fitted at: a table its
// column widths, a figure its width and height, when the view can measure them.
function keepFittedSize(
  tr: Transaction,
  view: EditorView,
  found: { node: ProseMirrorNode; pos: number },
): void {
  if (found.node.type.name === 'table') {
    const widths = laidOutColumnWidths(view, found.pos);
    if (widths) writeColumnWidths(tr, found.pos, widths);
    return;
  }
  const size = laidOutFigureSize(view, found.pos);
  if (size) tr.setNodeMarkup(found.pos, undefined, { ...tr.doc.nodeAt(found.pos)?.attrs, ...size });
}

/**
 * Aligns the object selected: left, centred or right, or across the page's width (`fit`). An
 * object leaving the fit keeps the size it was fitted at (`keepFittedSize`).
 */
export function setObjectLayout(layout: 'left' | 'center' | 'right' | 'fit' | null): Command {
  return (state, dispatch, view) => {
    const found = nodeAtSelection(state, ['figure', 'table']);
    if (!found || !('objectLayout' in found.node.attrs)) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(found.pos, undefined, {
        ...found.node.attrs,
        objectLayout: storedLayout(layout),
      });
      const leavesFit = found.node.attrs.objectLayout === 'fit-page-width' && layout !== 'fit';
      if (leavesFit && view) keepFittedSize(tr, view, found);
      dispatch(keepNodeSelected(tr, state));
    }
    return true;
  };
}

/**
 * Pins every figure showing a stored asset to the snapshot given, as a diagram editor stores a new
 * snapshot of the same asset; false when no figure shows it.
 */
export function pinFigureSnapshot(asset: {
  assetId: string;
  snapshotId?: string | undefined;
}): Command {
  return (state, dispatch) => {
    const snapshotId = asset.snapshotId ?? asset.assetId;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'figure' || node.attrs.fileAssetId !== asset.assetId) return true;
      if (node.attrs.snapshotId !== snapshotId) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, snapshotId });
      }
      return false;
    });
    if (!tr.docChanged) return false;
    dispatch?.(tr);
    return true;
  };
}
