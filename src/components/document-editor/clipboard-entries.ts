// The context menu's clipboard entries: Cut and Copy write the selection as the editor copies it,
// Paste and Paste as plain text read the clipboard. Paste hands what the clipboard holds to the
// same entry point as a paste from the keyboard (`pasteImages`), so a copied image, or content
// whose images come with it, is uploaded and becomes figures from the menu too.

import { ClipboardGlyph, CopyGlyph } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import type { DocumentEditorLabels } from './editor-labels.js';
import { type FigurePasteOptions, type PastedContent, pasteImages } from './figure-paste.js';

/** What the clipboard entries need. */
export interface ClipboardEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly editable: boolean;
  /** Uploads pasted images, while the host stores assets. */
  readonly images?: FigurePasteOptions | null | undefined;
}

const clipboardOf = (view: EditorView) =>
  view.dom.ownerDocument.defaultView?.navigator.clipboard ?? null;

// Writes the selection to the clipboard as the editor copies it, and deletes it for a cut once
// the clipboard has it.
async function copySelection(view: EditorView, cut: boolean): Promise<void> {
  const owner = view.dom.ownerDocument.defaultView;
  const clipboard = clipboardOf(view);
  if (!owner || !clipboard) return;
  const { dom, text } = view.serializeForClipboard(view.state.selection.content());
  if (typeof owner.ClipboardItem === 'function') {
    const blob = (value: string, type: string) => new owner.Blob([value], { type });
    const item = new owner.ClipboardItem({
      'text/html': blob(dom.innerHTML, 'text/html'),
      'text/plain': blob(text, 'text/plain'),
    });
    await clipboard.write([item]);
  } else {
    await clipboard.writeText(text);
  }
  if (cut) view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
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
  { plain, images }: { plain: boolean; images: FigurePasteOptions | null },
): Promise<void> {
  const clipboard = clipboardOf(view);
  if (!clipboard) return;
  if (!plain && typeof clipboard.read === 'function') {
    const content = await clipboardContent(await clipboard.read());
    if (view.isDestroyed || (images && pasteImages(view, content, images))) return;
    if (content.html) {
      view.pasteHTML(content.html);
      return;
    }
  }
  const text = await clipboard.readText();
  if (text && !view.isDestroyed) view.pasteText(text);
}

// Runs a clipboard action with the document focused; a refused clipboard changes nothing.
function clipboardAction(view: EditorView, action: () => Promise<void>) {
  return () => {
    view.focus();
    action().catch(() => undefined);
  };
}

/** The Cut, Copy, Paste and Paste as plain text entries for the view's selection. */
export function clipboardEntries(view: EditorView, options: ClipboardEntriesOptions): MenuEntry[] {
  const { labels, editable, images = null } = options;
  const { empty } = view.state.selection;
  const clipboard = clipboardOf(view);
  const canPaste = editable && typeof clipboard?.readText === 'function';
  return [
    {
      id: 'cut',
      label: labels.cut,
      shortcut: 'Ctrl+X',
      isDisabled: !editable || empty || !clipboard,
      onAction: clipboardAction(view, () => copySelection(view, true)),
    },
    {
      id: 'copy',
      label: labels.copy,
      icon: CopyGlyph,
      shortcut: 'Ctrl+C',
      isDisabled: empty || !clipboard,
      onAction: clipboardAction(view, () => copySelection(view, false)),
    },
    {
      id: 'paste',
      label: labels.paste,
      icon: ClipboardGlyph,
      shortcut: 'Ctrl+V',
      isDisabled: !canPaste,
      onAction: clipboardAction(view, () => paste(view, { plain: false, images })),
    },
    {
      id: 'paste-text',
      label: labels.pasteAsText,
      shortcut: 'Ctrl+Shift+V',
      isDisabled: !canPaste,
      onAction: clipboardAction(view, () => paste(view, { plain: true, images })),
    },
  ];
}
