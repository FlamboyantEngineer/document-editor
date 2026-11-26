// Images pasted or dropped into the document become figures: each file's natural size is read from
// its bytes, all are uploaded through the host's assets, then inserted in order where they were
// pasted or dropped (`paste-place.ts`), each at the size a new figure takes there. If a file's
// size cannot be read, any upload fails, or a file is larger than the host takes, nothing is
// inserted and the reader is told through the host's feedback. Pasted HTML whose images come with the paste, as data URIs or
// as a word processor's pictures, is pasted once all its images are uploaded, each a figure, at
// the selection it was pasted at; an image whose bytes the paste lacks pastes nothing, and if the
// document changed meanwhile nothing is pasted and the reader is asked to paste again. An image of
// math that carries its LaTeX becomes that math instead (DOCE-OBJECTS-1.12). A paste from the
// keyboard and the context menu's Paste both go through `pasteImages`.

import { readMathImage } from '@flamboyantengineer/ui-components/math-preview';
import { DOMSerializer } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { insertMath } from '../../engine/index.js';
import type { AssetAdapter, FeedbackAdapter } from '../../host/index.js';
import { createFigure } from '../../model/schema/caption-content.js';
import type { ImageSize } from '../../model/schema/image-size.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { newFigureBox } from './figure-size.js';
import { fileImageSize } from './natural-size.js';
import { insertAt, insertFigureAt, type PastePlace } from './paste-place.js';
import { hasPastedImages, hasPastedMath, hasPastedText, pastedImages } from './pasted-images.js';

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
  /** Tells the reader a file's size could not be read, so it was not inserted. */
  readonly unreadable: (name: string) => string;
  /** Asks the reader to paste again: the document changed while the images uploaded. */
  readonly pasteAgain: string;
  /** Whether the context menu's original paste target still applies after an upload. */
  readonly isCurrent?: (() => boolean) | undefined;
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
    unreadable: labels.imageUnreadable,
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

/** A file stored through the host's assets, with the natural size its bytes give. */
interface StoredImage {
  readonly fileAssetId: string;
  readonly snapshotId: string;
  readonly natural: ImageSize;
}

// The natural size of each file, read before any is uploaded: null once a file is missing or its
// bytes give no size, the reader told which.
async function sizesOf(
  files: readonly (File | null)[],
  options: FigurePasteOptions,
): Promise<ImageSize[] | null> {
  const sizes: ImageSize[] = [];
  for (const file of files) {
    if (!file) return refuse(options);
    const size = await fileImageSize(file);
    if (!size) return refuse(options, options.unreadable(file.name));
    sizes.push(size);
  }
  return sizes;
}

// Reads the files' sizes, then uploads them one by one, in order: the stored images, or null once
// one has no size, fails or is larger than the host takes, the reader told why.
async function uploadAll(
  files: readonly (File | null)[],
  options: FigurePasteOptions,
): Promise<StoredImage[] | null> {
  const sizes = await sizesOf(files, options);
  if (!sizes) return null;
  const stored: StoredImage[] = [];
  const max = options.assets.maxUploadBytes;
  for (const [index, file] of files.entries()) {
    const natural = sizes[index];
    if (!file || !natural) return refuse(options);
    if (max !== undefined && file.size > max) return refuse(options, options.tooLarge(max));
    const result = await options.assets.upload(file).catch(() => null);
    if (!result?.ok) return refuse(options, result?.error.message);
    const { id, snapshotId } = result.value;
    stored.push({ fileAssetId: id, snapshotId: snapshotId ?? id, natural });
  }
  return stored;
}

function refuse(options: FigurePasteOptions, message?: string): null {
  options.feedback?.notify({ tone: 'error', text: message ?? options.failure });
  return null;
}

// Images copied from math with their LaTeX (`copyMathImage`) become that math again, in order, when
// every image is one; true when they were.
async function insertMathImages(
  view: EditorView,
  { files, at }: { files: File[]; at: PastePlace },
  options: FigurePasteOptions,
): Promise<boolean> {
  const maths = await Promise.all(files.map((file) => readMathImage(file)));
  if (maths.some((math) => math === null)) return false;
  if (!canTake(view) || options.isCurrent?.() === false) return true;
  let place = at;
  for (const math of maths) if (math) place = insertAt(view, place, insertMath(math.source, math));
  return true;
}

// Uploads all the images, then inserts them as figures in order: the first at the place they were
// pasted or dropped at, each next one after the one before. Nothing is inserted if one fails.
async function insertFigures(
  view: EditorView,
  { files, at }: { files: File[]; at: PastePlace },
  options: FigurePasteOptions,
) {
  if (await insertMathImages(view, { files, at }, options)) return;
  const stored = await uploadAll(files, options);
  if (!stored || !canTake(view) || options.isCurrent?.() === false) return;
  let place = at;
  stored.forEach((asset, index) => {
    place = insertFigureAt(view, place, { ...asset, alt: files[index]?.name ?? '' });
  });
}

// A stored image of pasted HTML written as a figure's markup, at the size a new figure takes where
// it is pasted.
function figureMarkup(view: EditorView, { natural, ...asset }: StoredImage, alt: string) {
  const size = newFigureBox(view, view.state.selection.from, natural);
  const node = createFigure(view.state.schema, { ...asset, ...size, alt });
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
  if (options.isCurrent?.() === false) return;
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
  if (!view.editable || hasPastedMath(content.html)) return false;
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
