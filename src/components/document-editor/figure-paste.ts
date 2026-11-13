// Images pasted or dropped into the document become figures: each is uploaded through the host's
// assets, then inserted where it was pasted or dropped. An upload that fails inserts nothing and
// tells the reader through the host's feedback. Pasted HTML whose images come with the paste, as
// data URIs or as a word processor's pictures, is pasted once its images are uploaded, each a
// figure.

import { DOMSerializer } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { insertFigure } from '../../engine/index.js';
import type { AssetAdapter, FeedbackAdapter } from '../../host/index.js';
import { hasPastedImages, hasPastedText, type PastedImage, pastedImages } from './pasted-images.js';

/** What pasting images needs from the host. */
export interface FigurePasteOptions {
  readonly assets: AssetAdapter;
  readonly feedback?: FeedbackAdapter | undefined;
  /** Tells the reader an image could not be uploaded. */
  readonly failure: string;
  /** Tells the reader the images of pasted content are uploading. */
  readonly uploading: string;
}

/** What a paste carries: its files, its HTML and the RTF flavour of the same paste. */
export interface PastedContent {
  readonly files: readonly File[];
  readonly html: string;
  readonly rtf: string;
}

const imagesOf = (files: Iterable<File> | null | undefined): File[] =>
  [...(files ?? [])].filter((file) => file.type.startsWith('image/'));

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
  { html, rtf }: Pick<PastedContent, 'html' | 'rtf'>,
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

/**
 * Pastes what carries images of its own, once they are uploaded: image files become figures, and
 * HTML with images whose bytes come with the paste is pasted with each as a figure. HTML with
 * text is the content pasted, and an image file beside it only a picture of that content, so the
 * files are taken when the HTML holds no text. Returns false for a paste without such images, or
 * into a document that cannot be edited, which is left to the caller.
 */
export function pasteImages(
  view: EditorView,
  content: PastedContent,
  options: FigurePasteOptions,
): boolean {
  if (!view.editable) return false;
  const files = imagesOf(content.files);
  if (files.length > 0 && !hasPastedText(content.html)) {
    void insertFigures(view, files, options);
    return true;
  }
  if (!hasPastedImages(content.html)) return false;
  void pasteWithImages(view, content, options);
  return true;
}

/** The view's paste and drop handlers that upload images and insert them as figures. */
export function figurePasteHandlers(options: FigurePasteOptions) {
  return {
    handlePaste(view: EditorView, event: ClipboardEvent): boolean {
      const data = event.clipboardData;
      const content = {
        files: [...(data?.files ?? [])],
        html: data?.getData('text/html') ?? '',
        rtf: data?.getData('text/rtf') ?? '',
      };
      if (!pasteImages(view, content, options)) return false;
      event.preventDefault();
      return true;
    },
    handleDrop(view: EditorView, event: DragEvent): boolean {
      const files = imagesOf(event.dataTransfer?.files);
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
