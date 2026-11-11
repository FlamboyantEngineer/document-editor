// Pasting from a word processor: its HTML is cleaned of the word processor's own markup before the
// editor reads it, so its lists stay lists and its styles do not come along.

import { Plugin, PluginKey } from 'prosemirror-state';
import { cleanWordHtml, isWordHtml } from '../model/index.js';

/** Cleans HTML pasted from a word processor before the editor reads it. */
export function createWordPaste(): Plugin {
  return new Plugin({
    key: new PluginKey('word-paste'),
    props: {
      transformPastedHTML: (html, view) =>
        isWordHtml(html) ? cleanWordHtml(html, view.dom.ownerDocument) : html,
    },
  });
}
