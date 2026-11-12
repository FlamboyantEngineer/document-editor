// Lists of contents: a table of contents, lists of figures, tables, code and equations, and any
// kind of list a host configures, drawn live from the document's catalog. A plugin keeps the catalog and hands each list block its rows;
// the list's node view draws them, and an entry takes the reader to what it names.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import {
  Decoration,
  DecorationSet,
  type EditorView,
  type NodeViewConstructor,
} from 'prosemirror-view';
import {
  catalogDocument,
  type CatalogEntry,
  type ContentsKind,
  DEFAULT_CONTENTS_KINDS,
  type DocumentCatalog,
  resolveContentsList,
  type TemplateFile,
} from '../model/index.js';

/** A list's title, and what it shows when it lists nothing. */
export interface ContentsLabels {
  title: string;
  empty: string;
}

/** The labels each default list shows unless a host gives its own. */
export const CONTENTS_LABELS: Readonly<
  Record<keyof typeof DEFAULT_CONTENTS_KINDS, ContentsLabels>
> = {
  toc: { title: 'Table of Contents', empty: 'No headings found.' },
  figures: { title: 'Table of Figures', empty: 'No figures found.' },
  tables: { title: 'Table of Tables', empty: 'No tables found.' },
  codeBlocks: { title: 'Table of Code Blocks', empty: 'No code listings found.' },
  equations: { title: 'Table of Equations', empty: 'No equations found.' },
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
}

/** A list of contents' rows, as its block's decoration hands them to its view. */
interface ContentsRows {
  readonly entries: readonly CatalogEntry[];
  readonly empty: boolean;
}

/** What a contents plugin keeps: the catalog, and the rows each list block shows. */
export interface ContentsState {
  readonly catalog: DocumentCatalog;
  readonly decorations: DecorationSet;
}

/** The catalog a contents plugin keeps; marks a transaction that draws the lists again. */
export const contentsKey = new PluginKey<ContentsState>('contents');

// The kinds a contents plugin lists, and the one a list block names.
interface Kinds {
  readonly all: Readonly<Record<string, ContentsKind>>;
  readonly of: (node: ProseMirrorNode) => string;
}

// The entries a list block shows: those of its kind (after it, for a kind that lists only those),
// down to its deepest level, in the range a split part holds.
function rowsOf(
  node: ProseMirrorNode,
  pos: number,
  { catalog, kinds }: { catalog: DocumentCatalog; kinds: Kinds },
): ContentsRows {
  const key = kinds.of(node);
  const after = kinds.all[key]?.after === true;
  const deepest = Number(node.attrs.minLevel) || 6;
  const listed = (catalog[key] ?? []).filter(
    (entry) => (!after || entry.pos > pos) && entry.level <= deepest,
  );
  const start = Number(node.attrs.entryStart) || 0;
  const end = Number.isInteger(node.attrs.entryEnd) ? Number(node.attrs.entryEnd) : listed.length;
  return { entries: listed.slice(start, end), empty: listed.length === 0 };
}

function decorate(doc: ProseMirrorNode, catalog: DocumentCatalog, kinds: Kinds): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'toc_block') {
      decorations.push(
        Decoration.node(
          pos,
          pos + node.nodeSize,
          {},
          { contents: rowsOf(node, pos, { catalog, kinds }) },
        ),
      );
    }
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

function stateOf(doc: ProseMirrorNode, template: TemplateFile, kinds: Kinds): ContentsState {
  const catalog = catalogDocument(doc, template, kinds.all);
  return { catalog, decorations: decorate(doc, catalog, kinds) };
}

// A short hash naming the rows a list draws, so pagination measures it again when they change.
function measureKey(node: ProseMirrorNode, { rows, labels, leaders, showPage }: Drawing): string {
  const text = [
    String(node.attrs.showTitle),
    labels.title,
    labels.empty,
    leaders.map(String).join('|'),
    String(showPage),
    String(rows.empty),
    ...rows.entries.map(
      (entry) => `${String(entry.level)}|${entry.number}|${entry.text}|${String(entry.page)}`,
    ),
  ].join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function rowsIn(decorations: readonly Decoration[]): ContentsRows {
  for (const decoration of decorations) {
    const rows = (decoration.spec as { contents?: ContentsRows }).contents;
    if (rows) return rows;
  }
  return { entries: [], empty: true };
}

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

interface Drawing {
  readonly rows: ContentsRows;
  readonly labels: ContentsLabels;
  /** Each level's leader character, from level 1, or null for none. */
  readonly leaders: readonly (string | null)[];
  /** Whether the entries show their page numbers. */
  readonly showPage: boolean;
  /** Takes the reader to the entry at an index of the rows the list shows now. */
  readonly navigate: (index: number) => void;
}

function drawEntry(entry: CatalogEntry, index: number, drawing: Drawing): HTMLElement {
  const row = document.createElement('div');
  row.className = 'de-contents__entry';
  row.dataset.level = String(entry.level || 1);
  row.setAttribute('role', 'link');
  row.tabIndex = -1;
  if (entry.number) row.append(span('de-contents__number', entry.number));
  row.append(span('de-contents__text', entry.text));
  const character = drawing.leaders[(entry.level || 1) - 1] ?? null;
  if (character !== null && drawing.showPage) {
    const leader = span('de-contents__leader', character.repeat(200));
    leader.setAttribute('aria-hidden', 'true');
    row.append(leader);
  }
  if (drawing.showPage) row.append(span('de-contents__page', String(entry.page)));
  row.addEventListener('click', () => drawing.navigate(index));
  return row;
}

// Draws a list's rows, unless it already shows them.
function draw(dom: HTMLElement, node: ProseMirrorNode, drawing: Drawing) {
  const { rows } = drawing;
  const key = measureKey(node, drawing);
  if (dom.dataset.deMeasureKey === key) return;
  const parts: HTMLElement[] = [];
  if (node.attrs.showTitle !== false) {
    const title = document.createElement('div');
    title.className = 'de-contents__title';
    title.textContent = drawing.labels.title;
    parts.push(title);
    if (rows.empty) {
      const empty = document.createElement('div');
      empty.className = 'de-contents__empty';
      empty.textContent = drawing.labels.empty;
      parts.push(empty);
    }
  }
  parts.push(...rows.entries.map((entry, index) => drawEntry(entry, index, drawing)));
  dom.replaceChildren(...parts);
  dom.dataset.deMeasureKey = key;
}

/** Takes the reader to what an entry names, with the caret at its start. */
function goTo(view: EditorView, entry: CatalogEntry) {
  const { doc } = view.state;
  const pos = Math.min(entry.pos + 1, doc.content.size);
  view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(pos))).scrollIntoView());
  view.focus();
}

/** The catalog a contents plugin keeps in a state, or null without one. */
export function contentsCatalog(state: EditorState): DocumentCatalog | null {
  return contentsKey.getState(state)?.catalog ?? null;
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
}: ContentsOptions): Plugin<ContentsState> {
  const all: Record<string, ContentsKind> = { ...DEFAULT_CONTENTS_KINDS, ...added };
  const kinds: Kinds = {
    all,
    of: (node) => {
      const type: unknown = node.attrs.tocType;
      return typeof type === 'string' && Object.hasOwn(all, type) ? type : 'toc';
    },
  };
  const defaults: Readonly<Record<string, ContentsLabels>> = CONTENTS_LABELS;
  const drawingFor = (
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
      leaders: list.levels.map((level) => (kind?.leader === false ? null : level.leader)),
      showPage: kind?.showPage !== false,
      navigate,
    };
  };
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
      stopEvent: (event) => event.type === 'mousedown' || event.type === 'click',
    };
  };
  return new Plugin<ContentsState>({
    key: contentsKey,
    state: {
      init: (_config, state) => stateOf(state.doc, template(), kinds),
      apply: (tr, value) =>
        tr.docChanged || tr.getMeta(contentsKey) ? stateOf(tr.doc, template(), kinds) : value,
    },
    props: {
      decorations: (state) => contentsKey.getState(state)?.decorations ?? null,
      nodeViews: { toc_block: view },
    },
  });
}
