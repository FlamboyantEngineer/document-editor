// Images pasted or dropped into the document become figures: all are uploaded through the host's
// assets first, then inserted in order where they were pasted or dropped (`paste-place.ts`). If
// any upload fails, or a file is larger than the host takes, nothing is inserted and the reader is
// told through the host's feedback. Pasted HTML whose images come with the paste, as data URIs or
// as a word processor's pictures, is pasted once all its images are uploaded, each a figure, at
// the selection it was pasted at; an image whose bytes the paste lacks pastes nothing, and if the
// document changed meanwhile nothing is pasted and the reader is asked to paste again. A paste
// from the keyboard and the context menu's Paste both go through `pasteImages`.

import { DOMSerializer } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { AssetAdapter, FeedbackAdapter } from '../../host/index.js';
import { createFigure } from '../../model/schema/caption-content.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { insertFigureAt, type PastePlace } from './paste-place.js';
import { hasPastedImages, hasPastedText, pastedImages } from './pasted-images.js';

/** What pasting images needs from the host. */
export interface FigurePasteOptions {
  readonly assets: AssetAdapter;
  readonly feedback?: FeedbackAdapter | undefined;
  /** Tells the reader an image could not be uploaded. */
  readonly failure: string;
  /** Tells the reader the images of pasted content are uploading. */
  readonly uploading: string;
  /** Tells the reader a file is larger than the host takes. */
  readonly tooLarge: (maxBytes: number) => string;
  /** Asks the reader to paste again: the document changed while the images uploaded. */
  readonly pasteAgain: string;
}

/** What pasting images needs, from the editor's props; null while the host stores no assets. */
export function figurePasteOptions(
  { assets, feedback }: Pick<DocumentEditorProps, 'assets' | 'feedback'>,
  labels: DocumentEditorLabels,
): FigurePasteOptions | null {
  if (!assets) return null;
  return {
    assets,
    feedback,
    failure: labels.uploadFailed,
    uploading: labels.uploading,
    tooLarge: labels.uploadTooLarge,
    pasteAgain: labels.pasteAgain,
  };
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

// Uploads the files one by one, in order: the stored assets, or null once one fails or is larger
// than the host takes, the reader told why.
async function uploadAll(
  files: readonly (File | null)[],
  options: FigurePasteOptions,
): Promise<{ fileAssetId: string; snapshotId: string }[] | null> {
  const stored = [];
  const max = options.assets.maxUploadBytes;
  for (const file of files) {
    if (!file) return refuse(options);
    if (max !== undefined && file.size > max) return refuse(options, options.tooLarge(max));
    const result = await options.assets.upload(file).catch(() => null);
    if (!result?.ok) return refuse(options, result?.error.message);
    const { id, snapshotId } = result.value;
    stored.push({ fileAssetId: id, snapshotId: snapshotId ?? id });
  }
  return stored;
}

function refuse(options: FigurePasteOptions, message?: string): null {
  options.feedback?.notify({ tone: 'error', text: message ?? options.failure });
  return null;
}

// Uploads all the images, then inserts them as figures in order: the first at the place they were
// pasted or dropped at, each next one after the one before. Nothing is inserted if one fails.
async function insertFigures(
  view: EditorView,
  { files, at }: { files: File[]; at: PastePlace },
  options: FigurePasteOptions,
) {
  const stored = await uploadAll(files, options);
  if (!stored || !canTake(view)) return;
  let place = at;
  stored.forEach((asset, index) => {
    place = insertFigureAt(view, place, { ...asset, alt: files[index]?.name ?? '' });
  });
}

// A stored image of pasted HTML written as a figure's markup.
function figureMarkup(
  view: EditorView,
  asset: { fileAssetId: string; snapshotId: string },
  alt: string,
) {
  const node = createFigure(view.state.schema, { ...asset, alt });
  if (!node) return '';
  const container = view.dom.ownerDocument.createElement('div');
  container.append(DOMSerializer.fromSchema(view.state.schema).serializeNode(node));
  return container.innerHTML;
}

// Uploads all the images of pasted HTML, then pastes it, each image a figure, at the selection it
// was pasted at: nothing when an image fails or lacks its bytes, or when the document changed.
async function pasteWithImages(
  view: EditorView,
  { html, rtf, at }: Pick<PastedContent, 'html' | 'rtf'> & { at: PastePlace },
  options: FigurePasteOptions,
) {
  options.feedback?.notify({ tone: 'info', text: options.uploading });
  const images = pastedImages(html, rtf);
  const stored = await uploadAll(
    images.map((image) => image.file ?? null),
    options,
  );
  if (!stored || !canTake(view)) return;
  if (view.state.doc !== at.doc) {
    options.feedback?.notify({ tone: 'error', text: options.pasteAgain });
    return;
  }
  let pasted = html;
  images.forEach((image, index) => {
    const asset = stored[index];
    const markup = asset ? figureMarkup(view, asset, image.alt || image.file?.name || '') : '';
    pasted = pasted.replace(image.tag, () => markup);
  });
  if (!view.state.selection.eq(at.selection)) {
    view.dispatch(view.state.tr.setSelection(at.selection));
  }
  view.pasteHTML(pasted);
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
  const at = { doc: view.state.doc, selection: view.state.selection };
  void pasteWithImages(view, { ...content, at }, options);
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
