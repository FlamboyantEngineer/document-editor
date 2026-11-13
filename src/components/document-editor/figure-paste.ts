// Images pasted or dropped into the document become figures: each is uploaded through the host's
// assets, then inserted where it was pasted or dropped (`paste-place.ts`). An upload that fails
// inserts nothing and tells the reader through the host's feedback. Pasted HTML whose images come
// with the paste, as data URIs or as a word processor's pictures, is pasted once its images are
// uploaded, each a figure, at the selection then: the view pastes HTML only there.

import { DOMSerializer } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { AssetAdapter, FeedbackAdapter } from '../../host/index.js';
import { insertFigureAt, type PastePlace } from './paste-place.js';
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

// Whether the document can still take what was pasted: its view may be gone, or the document read
// only, by the time an upload ends.
const canTake = (view: EditorView) => !view.isDestroyed && view.editable;

// Uploads the images one by one, inserting each as a figure once stored: the first at the place
// they were pasted or dropped at, each next one after the one before.
async function insertFigures(
  view: EditorView,
  { files, at }: { files: File[]; at: PastePlace },
  options: FigurePasteOptions,
) {
  let place = at;
  for (const file of files) {
    const result = await options.assets.upload(file).catch(() => null);
    if (!result?.ok) {
      options.feedback?.notify({ tone: 'error', text: result?.error.message ?? options.failure });
      continue;
    }
    if (!canTake(view)) continue;
    const { id, snapshotId } = result.value;
    const source = { fileAssetId: id, snapshotId: snapshotId ?? id, alt: file.name };
    place = insertFigureAt(view, place, source);
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
  if (canTake(view)) view.pasteHTML(pasted);
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
    const at = { doc: view.state.doc, selection: view.state.selection };
    void insertFigures(view, { files, at }, options);
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
      const { doc } = view.state;
      const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
      // The caret goes where the images were dropped, which is their place whatever it does next.
      const selection = hit ? TextSelection.near(doc.resolve(hit.pos)) : view.state.selection;
      if (hit) view.dispatch(view.state.tr.setSelection(selection));
      void insertFigures(view, { files, at: { doc, selection } }, options);
      return true;
    },
  };
}
