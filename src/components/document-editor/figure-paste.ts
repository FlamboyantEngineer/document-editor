// Images pasted or dropped into the document become figures: each is uploaded through the host's
// assets, then inserted where it was pasted or dropped. An upload that fails inserts nothing and
// tells the reader through the host's feedback.

import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { setFigure } from '../../engine/index.js';
import type { AssetAdapter, FeedbackAdapter } from '../../host/index.js';

/** What pasting images needs from the host. */
export interface FigurePasteOptions {
  readonly assets: AssetAdapter;
  readonly feedback?: FeedbackAdapter | undefined;
  /** Tells the reader an image could not be uploaded. */
  readonly failure: string;
}

// The image files a paste or a drop carries.
function imagesOf(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/'));
}

// Uploads the images one by one, inserting each as a figure once stored, at the selection then.
async function insertFigures(view: EditorView, files: File[], options: FigurePasteOptions) {
  for (const file of files) {
    const result = await options.assets.upload(file).catch(() => null);
    if (!result?.ok) {
      options.feedback?.notify({ tone: 'error', text: result?.error.message ?? options.failure });
      continue;
    }
    const { id, snapshotId } = result.value;
    const command = setFigure({ fileAssetId: id, snapshotId: snapshotId ?? id, alt: file.name });
    if (!view.isDestroyed) command(view.state, view.dispatch, view);
  }
}

/** The view's paste and drop handlers that upload images and insert them as figures. */
export function figurePasteHandlers(options: FigurePasteOptions) {
  return {
    handlePaste(view: EditorView, event: ClipboardEvent): boolean {
      const files = imagesOf(event.clipboardData);
      if (files.length === 0 || !view.editable) return false;
      event.preventDefault();
      void insertFigures(view, files, options);
      return true;
    },
    handleDrop(view: EditorView, event: DragEvent): boolean {
      const files = imagesOf(event.dataTransfer);
      if (files.length === 0 || !view.editable) return false;
      event.preventDefault();
      const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (at) {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))),
        );
      }
      void insertFigures(view, files, options);
      return true;
    },
  };
}
