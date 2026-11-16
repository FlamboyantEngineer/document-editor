// Lists of contents: a table of contents, lists of figures, tables, code and equations, and any
// kind of list a host configures, drawn live from the document's catalog. A plugin keeps the
// catalog and hands each list block its rows, with the page the layout shows each entry on; the
// list's node view draws them, and an entry takes the reader to what it names.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import {
  type Decoration,
  DecorationSet,
  type EditorView,
  type NodeViewConstructor,
} from 'prosemirror-view';
import {
  abbreviationTargetId,
  type CatalogEntry,
  type ContentsKind,
  contentsListProperties,
  DEFAULT_CONTENTS_KINDS,
  type DocumentCatalog,
  type FontStacks,
  resolveContentsList,
  type TemplateFile,
} from '../model/index.js';
import { type PageMap, pageMap } from '../pagination/page-map.js';
import {
  type ContentsState,
  decorate,
  type InnerState,
  type Kinds,
  stateOf,
} from './contents-listing.js';
import { hasContents } from './contents-presence.js';
import {
  type ContentsLabels,
  type ContentsRows,
  copyRows,
  draw,
  type Drawing,
  rowsIn,
} from './contents-view.js';

export type { ContentsLabels } from './contents-view.js';

/** The labels each default list shows unless a host gives its own. */
export const CONTENTS_LABELS: Readonly<
  Record<keyof typeof DEFAULT_CONTENTS_KINDS, ContentsLabels>
> = {
  toc: { title: 'Table of Contents', empty: 'No headings found.' },
  figures: { title: 'Table of Figures', empty: 'No figures found.' },
  tables: { title: 'Table of Tables', empty: 'No tables found.' },
  codeBlocks: { title: 'Table of Code Blocks', empty: 'No code listings found.' },
  equations: { title: 'Table of Equations', empty: 'No equations found.' },
  references: { title: 'References', empty: 'No references found.' },
  abbreviations: { title: 'Abbreviations', empty: 'No abbreviations found.' },
};

/** The labels of a kind of list that neither the defaults nor the host label. */
const UNLABELLED: ContentsLabels = { title: 'Contents', empty: 'Nothing to list.' };

/** How lists of contents are drawn. */
export interface ContentsOptions {
  /** The document's resolved template, which numbers what the lists show. */
  template: () => TemplateFile;
  /**
   * Kinds of list to add, or to use in place of a default one of the same key. A list block's
   * `tocType` names its kind; a block naming none the editor knows lists headings.
   */
  kinds?: Readonly<Record<string, ContentsKind>> | undefined;
  /** Labels in place of the default ones, by kind. */
  labels?: Readonly<Record<string, Partial<ContentsLabels>>> | undefined;
  /** The fonts the host serves itself, by the family name a template uses. */
  fontStacks?: FontStacks | undefined;
}

export type { ContentsState } from './contents-listing.js';

/** The catalog a contents plugin keeps; marks a transaction that draws the lists again. */
export const contentsKey = new PluginKey<ContentsState>('contents');

// The rows a plugin state draws, each entry on the page the layout shows it on, once for each
// state and layout: the catalog counts a section as one page, the layout knows where pages break.
const onLayout = new WeakMap<ContentsState, { map: PageMap; set: DecorationSet }>();

function pagedDecorations(state: EditorState, value: ContentsState, kinds: Kinds): DecorationSet {
  if (!hasContents(state.doc)) return DecorationSet.empty;
  const map = pageMap(state);
  const cached = onLayout.get(value);
  if (cached?.map === map) return cached.set;
  const { listing } = value as InnerState;
  const catalog = Object.fromEntries(
    Object.entries(listing.catalog).map(([key, entries]) => [
      key,
      entries.map((entry) => ({ ...entry, page: map.pageAt(entry.pos)?.number ?? entry.page })),
    ]),
  );
  const set = decorate(state.doc, { catalog, lists: listing.lists }, kinds);
  onLayout.set(value, { map, set });
  return set;
}

/** Takes the reader to what an entry names, with the caret at its start. */
function goTo(view: EditorView, entry: CatalogEntry) {
  const { doc } = view.state;
  const pos = Math.min(entry.pos + 1, doc.content.size);
  view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(pos))).scrollIntoView());
  view.focus();
}

/**
 * Follows an abbreviation to its entry in a list of abbreviations, on a click in a read document
 * or a Ctrl or Cmd click in an edited one; false when no list shows its entry.
 */
function followAnchor(view: EditorView, node: ProseMirrorNode, event: MouseEvent): boolean {
  if (node.type.name !== 'abbreviation_reference') return false;
  if (view.editable && !event.ctrlKey && !event.metaKey) return false;
  const target = view.dom.ownerDocument.getElementById(
    abbreviationTargetId(String(node.attrs.entryId)),
  );
  if (!target || !view.dom.contains(target)) return false;
  event.preventDefault();
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return true;
}

/** The catalog a contents plugin keeps in a state, or null without one. */
export function contentsCatalog(state: EditorState): DocumentCatalog | null {
  return contentsKey.getState(state)?.catalog ?? null;
}

/** The rows the list of contents at a position shows; none without a contents plugin. */
export function contentsRowsAt(state: EditorState, pos: number): ContentsRows {
  const size = state.doc.nodeAt(pos)?.nodeSize ?? 0;
  return rowsIn(contentsKey.getState(state)?.decorations.find(pos, pos + size) ?? []);
}

// What a list block draws, by its kind: the kind's labels and title, its levels' leaders and
// custom properties, from the template.
function drawingWith({
  template,
  kinds,
  labels = {},
  fontStacks,
}: Omit<ContentsOptions, 'kinds'> & { kinds: Kinds }) {
  const defaults: Readonly<Record<string, ContentsLabels>> = CONTENTS_LABELS;
  return (
    node: ProseMirrorNode,
    rows: ContentsRows,
    navigate: (index: number) => void,
  ): Drawing => {
    const key = kinds.of(node);
    const kind = kinds.all[key];
    const list = resolveContentsList(template().styles?.contents, key);
    const label = { ...(defaults[key] ?? UNLABELLED), ...labels[key] };
    return {
      rows,
      labels: list.title ? { ...label, title: list.title } : label,
      leaders: list.levels.map((level) =>
        kind?.leader === false ? null : (level.leader?.character ?? null),
      ),
      properties: contentsListProperties(list, fontStacks),
      showPage: kind?.showPage !== false,
      navigate,
    };
  };
}

/**
 * Lists of contents drawn from the document under its template: a plugin that keeps the catalog
 * and draws each `toc_block` with its node view, in every view it runs in. After the template
 * changes, a host dispatches a transaction with `contentsKey` meta to draw them again.
 */
export function createContents({
  template,
  kinds: added = {},
  labels = {},
  fontStacks,
}: ContentsOptions): Plugin<ContentsState> {
  const all: Record<string, ContentsKind> = { ...DEFAULT_CONTENTS_KINDS, ...added };
  const kinds: Kinds = {
    all,
    of: (node) => {
      const type: unknown = node.attrs.tocType;
      return typeof type === 'string' && Object.hasOwn(all, type) ? type : 'toc';
    },
  };
  const drawingFor = drawingWith({ template, kinds, labels, fontStacks });
  const view: NodeViewConstructor = (...[node, editor, , decorations]) => {
    const dom = document.createElement('div');
    dom.className = 'de-contents';
    dom.contentEditable = 'false';
    let current = node;
    let rows = rowsIn(decorations);
    const navigate = (index: number) => {
      const entry = rows.entries[index];
      if (entry) goTo(editor, entry);
    };
    const render = (next: ProseMirrorNode, decos: readonly Decoration[]) => {
      current = next;
      rows = rowsIn(decos);
      dom.dataset.contentsType = kinds.of(next);
      draw(dom, next, drawingFor(next, rows, navigate));
    };
    render(node, decorations);
    return {
      dom,
      update: (next, decos) => {
        if (next.type !== current.type) return false;
        render(next, decos);
        return true;
      },
      ignoreMutation: () => true,
      stopEvent: (event) => ['mousedown', 'click', 'keydown'].includes(event.type),
    };
  };
  const counter = { builds: 0 };
  return new Plugin<ContentsState>({
    key: contentsKey,
    state: {
      init: (_config, state) => stateOf({ doc: state.doc, template: template(), kinds, counter }),
      apply: (tr, value) => {
        if (tr.getMeta(contentsKey)) {
          return stateOf({ doc: tr.doc, template: template(), kinds, counter });
        }
        if (!tr.docChanged) return value;
        const from = { state: value as InnerState, tr };
        return stateOf({ doc: tr.doc, template: template(), kinds, counter, from });
      },
    },
    props: {
      decorations(state) {
        const value = contentsKey.getState(state);
        return value ? pagedDecorations(state, value, kinds) : null;
      },
      nodeViews: { toc_block: view },
      handleClickOn: (...[editor, , node, , event]) => followAnchor(editor, node, event),
      handleDOMEvents: { copy: copyRows },
    },
  });
}
