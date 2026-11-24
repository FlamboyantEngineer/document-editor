// The context menu's clipboard entries: Cut and Copy write the selection as the editor copies it,
// Paste and Paste as plain text read the clipboard. Paste hands what the clipboard holds to the
// same entry point as a paste from the keyboard (`pasteImages`), so a copied image, or content
// whose images come with it, is uploaded and becomes figures from the menu too.

import { ClipboardGlyph, CopyGlyph, copyRichText } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import type { DocumentEditorLabels } from './editor-labels.js';
import { type FigurePasteOptions, type PastedContent, pasteImages } from './figure-paste.js';

/** What the clipboard entries need. */
interface ClipboardEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly editable: boolean;
  /** Uploads pasted images, while the host stores assets. */
  readonly images?: FigurePasteOptions | null | undefined;
  readonly isClipboardCurrent?: (() => boolean) | undefined;
}

const clipboardOf = (view: EditorView) =>
  view.dom.ownerDocument.defaultView?.navigator.clipboard ?? null;

// Writes the selection to the clipboard as the editor copies it, both formats where the window's
// clipboard takes them. A cut deletes the range once it was copied and is still the edit target.
async function copySelection(view: EditorView, canCut?: () => boolean): Promise<void> {
  const { dom, text } = view.serializeForClipboard(view.state.selection.content());
  const copied = await copyRichText(
    { text, html: dom.innerHTML },
    { owner: view.dom, clipboard: clipboardOf(view), fallback: false },
  );
  if (copied !== 'failed' && canCut?.())
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
}

// A clipboard image as the file a paste would carry; the clipboard gives it no name.
const imageFile = (blob: Blob, type: string) =>
  new File([blob], `image.${type.slice('image/'.length).replace(/\+.*$/, '')}`, { type });

// What the clipboard holds, as a paste hands it to the document: its image files, its HTML and the
// RTF flavour of the same content.
async function clipboardContent(items: ClipboardItems): Promise<PastedContent> {
  const files: File[] = [];
  const text: Record<string, string> = {};
  for (const item of items) {
    for (const type of item.types) {
      if (type.startsWith('image/')) files.push(imageFile(await item.getType(type), type));
      else if (type === 'text/html' || type === 'text/rtf')
        text[type] ??= await (await item.getType(type)).text();
    }
  }
  return { files, html: text['text/html'] ?? '', rtf: text['text/rtf'] ?? '' };
}

// Pastes the clipboard at the selection: its images and formatted text unless `plain`, as a paste
// from the keyboard would, else its text.
async function paste(
  view: EditorView,
  {
    plain,
    images,
    isCurrent,
  }: {
    plain: boolean;
    images: FigurePasteOptions | null;
    isCurrent: () => boolean;
  },
): Promise<void> {
  const clipboard = clipboardOf(view);
  if (!clipboard) return;
  if (!plain && typeof clipboard.read === 'function') {
    const content = await clipboardContent(await clipboard.read());
    if (!isCurrent() || (images && pasteImages(view, content, { ...images, isCurrent }))) return;
    if (content.html) {
      view.pasteHTML(content.html);
      return;
    }
  }
  const text = await clipboard.readText();
  if (text && isCurrent()) view.pasteText(text);
}

// Runs a clipboard action with the document focused; a refused clipboard changes nothing.
function clipboardAction(view: EditorView, action: () => Promise<void>, canStart?: () => boolean) {
  return () => {
    if (view.isDestroyed || canStart?.() === false) return;
    view.focus();
    action().catch(() => undefined);
  };
}

/** The Cut, Copy, Paste and Paste as plain text entries for the view's selection. */
export function clipboardEntries(view: EditorView, options: ClipboardEntriesOptions): MenuEntry[] {
  const { labels, editable, images = null, isClipboardCurrent } = options;
  const { doc, selection } = view.state;
  const isCurrent = () =>
    editable &&
    !view.isDestroyed &&
    view.editable &&
    isClipboardCurrent?.() !== false &&
    view.state.doc === doc &&
    view.state.selection.eq(selection);
  const clipboard = clipboardOf(view);
  const canPaste = editable && typeof clipboard?.readText === 'function';
  return [
    {
      id: 'cut',
      label: labels.cut,
      shortcut: 'Ctrl+X',
      isDisabled: !editable || selection.empty || !clipboard,
      onAction: clipboardAction(view, () => copySelection(view, isCurrent), isCurrent),
    },
    {
      id: 'copy',
      label: labels.copy,
      icon: CopyGlyph,
      shortcut: 'Ctrl+C',
      isDisabled: selection.empty || !clipboard,
      onAction: clipboardAction(view, () => copySelection(view)),
    },
    {
      id: 'paste',
      label: labels.paste,
      icon: ClipboardGlyph,
      shortcut: 'Ctrl+V',
      isDisabled: !canPaste,
      onAction: clipboardAction(
        view,
        () => paste(view, { plain: false, images, isCurrent }),
        isCurrent,
      ),
    },
    {
      id: 'paste-text',
      label: labels.pasteAsText,
      shortcut: 'Ctrl+Shift+V',
      isDisabled: !canPaste,
      onAction: clipboardAction(
        view,
        () => paste(view, { plain: true, images, isCurrent }),
        isCurrent,
      ),
    },
  ];
}
