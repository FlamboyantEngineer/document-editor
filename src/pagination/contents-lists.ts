// What each list of contents block shows, for the pages' text layout engine to lay it out
// (DOCE-PAGINATION-10.11): from the contents plugin of the view that measures the pages, with the
// host's kinds and labels, or, without one, from the document's own catalog of the default kinds.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { contentsListOf } from '../engine/contents.js';
import { DEFAULT_KINDS, listLook, listOf } from '../engine/contents-look.js';
import { PAGE_DIGITS } from '../layout-engine/blocks/contents.js';
import type { ContentsList } from '../layout-engine/blocks/types.js';
import { catalogDocument, type DocumentCatalog, type TemplateFile } from '../model/index.js';

/** The lists of contents a document's blocks show. */
export interface ContentsLists {
  /** What a list block of a document shows; none for any other node. */
  of(node: ProseMirrorNode, doc: ProseMirrorNode | null): ContentsList | undefined;
  /**
   * What a list block shows and the digits its page boxes keep room for, as one key, which a kept
   * layout of it must match; empty for any other node.
   */
  keyOf(node: ProseMirrorNode, doc: ProseMirrorNode | null): string;
  /** The digits every row's page box keeps room for. */
  digits(): number;
  /** Keeps room for the digits of a page count, at least 3, and gives that number of digits. */
  pageDigits(count: number): number;
}

/** The lists of contents the pages' blocks show, read from the measuring view's plugin. */
export function createContentsLists(
  template: TemplateFile,
  view?: (() => EditorView | null) | undefined,
): ContentsLists {
  const catalogs = new WeakMap<ProseMirrorNode, DocumentCatalog>();
  const look = listLook({ template: () => template, kinds: DEFAULT_KINDS });
  const own = (node: ProseMirrorNode, doc: ProseMirrorNode) => {
    let catalog = catalogs.get(doc);
    if (!catalog) {
      catalog = catalogDocument(doc, template, DEFAULT_KINDS.all);
      catalogs.set(doc, catalog);
    }
    return listOf(node, { catalog, kinds: DEFAULT_KINDS, look });
  };
  const of = (node: ProseMirrorNode, doc: ProseMirrorNode | null) => {
    if (node.type.name !== 'toc_block') return undefined;
    const state = view?.()?.state;
    const fromPlugin = state ? contentsListOf(state, node) : undefined;
    if (fromPlugin) return fromPlugin;
    const source = doc ?? state?.doc;
    return source ? own(node, source) : undefined;
  };
  let digits = PAGE_DIGITS;
  return {
    of,
    keyOf: (node, doc) => {
      const list = of(node, doc);
      return list ? `|${String(digits)}|${JSON.stringify(list)}` : '';
    },
    digits: () => digits,
    pageDigits(count) {
      digits = Math.max(PAGE_DIGITS, String(Math.max(0, Math.floor(count))).length);
      return digits;
    },
  };
}
