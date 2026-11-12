// Images pasted or dropped into the document become figures: each is uploaded through the host's
// assets, then inserted where it was pasted or dropped. An upload that fails inserts nothing and
// tells the reader through the host's feedback. Pasted HTML whose images come with the paste, as
// data URIs or as a word processor's pictures, is pasted once its images are uploaded, each a figure.

import { DOMSerializer } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { insertFigure } from '../../engine/index.js';
import type { AssetAdapter, FeedbackAdapter } from '../../host/index.js';
import { hasPastedImages, type PastedImage, pastedImages } from './pasted-images.js';

/** What pasting images needs from the host. */
export interface FigurePasteOptions {
  readonly assets: AssetAdapter;
  readonly feedback?: FeedbackAdapter | undefined;
  /** Tells the reader an image could not be uploaded. */
  readonly failure: string;
  /** Tells the reader the images of pasted content are uploading. */
  readonly uploading: string;
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
    const command = insertFigure({ fileAssetId: id, snapshotId: snapshotId ?? id, alt: file.name });
    if (!view.isDestroyed) command(view.state, view.dispatch, view);
  }
}

// An image of pasted HTML uploaded and written as a figure's markup; nothing when it fails.
async function figureMarkup(
  view: EditorView,
  image: PastedImage,
  options: FigurePasteOptions,
): Promise<string> {
  const result = image.file ? await options.assets.upload(image.file).catch(() => null) : null;
  const figure = view.state.schema.nodes.figure;
  if (!result?.ok) {
    options.feedback?.notify({ tone: 'error', text: result?.error.message ?? options.failure });
    return '';
  }
  if (!figure) return '';
  const { id, snapshotId } = result.value;
  const alt = image.alt || image.file?.name || '';
  const node = figure.create({ fileAssetId: id, snapshotId: snapshotId ?? id, alt });
  const container = view.dom.ownerDocument.createElement('div');
  container.append(DOMSerializer.fromSchema(view.state.schema).serializeNode(node));
  return container.innerHTML;
}

// Uploads the images of pasted HTML one by one, then pastes it, each image a figure.
async function pasteWithImages(
  view: EditorView,
  { html, rtf }: { html: string; rtf: string },
  options: FigurePasteOptions,
) {
  options.feedback?.notify({ tone: 'info', text: options.uploading });
  let pasted = html;
  for (const image of pastedImages(html, rtf)) {
    const markup = await figureMarkup(view, image, options);
    pasted = pasted.replace(image.tag, () => markup);
  }
  if (!view.isDestroyed) view.pasteHTML(pasted);
}

/** The view's paste and drop handlers that upload images and insert them as figures. */
export function figurePasteHandlers(options: FigurePasteOptions) {
  return {
    handlePaste(view: EditorView, event: ClipboardEvent): boolean {
      if (!view.editable) return false;
      const files = imagesOf(event.clipboardData);
      const html = event.clipboardData?.getData('text/html') ?? '';
      if (files.length === 0 && !hasPastedImages(html)) return false;
      event.preventDefault();
      if (files.length > 0) void insertFigures(view, files, options);
      else {
        const rtf = event.clipboardData?.getData('text/rtf') ?? '';
        void pasteWithImages(view, { html, rtf }, options);
      }
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
