// Lists of contents: a table of contents and lists of figures, tables, code and equations, drawn
// live from the document's catalog. A plugin keeps the catalog and hands each list block its rows;
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
  type DocumentCatalog,
  type TemplateFile,
} from '../model/index.js';

/** The kinds of list a contents block shows. */
export type ContentsType = 'toc' | 'figures' | 'tables' | 'codeBlocks' | 'equations';

/** A list's title, and what it shows when it lists nothing. */
export interface ContentsLabels {
  title: string;
  empty: string;
}

/** The labels each list shows unless a host gives its own. */
export const CONTENTS_LABELS: Readonly<Record<ContentsType, ContentsLabels>> = {
  toc: { title: 'Table of Contents', empty: 'No headings found.' },
  figures: { title: 'Table of Figures', empty: 'No figures found.' },
  tables: { title: 'Table of Tables', empty: 'No tables found.' },
  codeBlocks: { title: 'Table of Code Blocks', empty: 'No code listings found.' },
  equations: { title: 'Table of Equations', empty: 'No equations found.' },
};

const CATALOG_KINDS = {
  toc: 'heading',
  figures: 'figure',
  tables: 'table',
  codeBlocks: 'codeBlock',
  equations: 'equation',
} as const satisfies Record<ContentsType, keyof DocumentCatalog>;

const isContentsType = (value: unknown): value is ContentsType =>
  typeof value === 'string' && Object.hasOwn(CATALOG_KINDS, value);

/** How lists of contents are drawn. */
export interface ContentsOptions {
  /** The document's resolved template, which numbers what the lists show. */
  template: () => TemplateFile;
  /** Labels in place of the default ones. */
  labels?: Partial<Record<ContentsType, Partial<ContentsLabels>>> | undefined;
}

/** A list of contents' rows, as its block's decoration hands them to its view. */
interface ContentsRows {
  readonly entries: readonly CatalogEntry[];
  readonly empty: boolean;
}

interface ContentsState {
  readonly catalog: DocumentCatalog;
  readonly decorations: DecorationSet;
}

/** The catalog a contents plugin keeps; marks a transaction that draws the lists again. */
export const contentsKey = new PluginKey<ContentsState>('contents');

// The entries a list block shows: those of its kind after it, down to its deepest heading level,
// in the range a split part holds.
function rowsOf(node: ProseMirrorNode, pos: number, catalog: DocumentCatalog): ContentsRows {
  const type = isContentsType(node.attrs.tocType) ? node.attrs.tocType : 'toc';
  const deepest = Number(node.attrs.minLevel) || 6;
  const listed = catalog[CATALOG_KINDS[type]].filter(
    (entry) => entry.pos > pos && (entry.kind !== 'heading' || entry.level <= deepest),
  );
  const start = Number(node.attrs.entryStart) || 0;
  const end = Number.isInteger(node.attrs.entryEnd) ? Number(node.attrs.entryEnd) : listed.length;
  return { entries: listed.slice(start, end), empty: listed.length === 0 };
}

function decorate(doc: ProseMirrorNode, catalog: DocumentCatalog): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'toc_block') {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {}, { contents: rowsOf(node, pos, catalog) }),
      );
    }
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

function stateOf(doc: ProseMirrorNode, template: TemplateFile): ContentsState {
  const catalog = catalogDocument(doc, template);
  return { catalog, decorations: decorate(doc, catalog) };
}

// A short hash naming the rows a list draws, so pagination measures it again when they change.
function measureKey(node: ProseMirrorNode, { rows, labels, leader }: Drawing): string {
  const text = [
    String(node.attrs.showTitle),
    labels.title,
    labels.empty,
    leader,
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
  readonly leader: string;
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
  const leader = span('de-contents__leader', drawing.leader.repeat(200));
  leader.setAttribute('aria-hidden', 'true');
  row.append(leader, span('de-contents__page', String(entry.page)));
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

/** Lists of contents: the plugin that keeps their catalog, and the node view that draws them. */
export interface Contents {
  readonly plugin: Plugin<ContentsState>;
  readonly nodeViews: {
    toc_block: NodeViewConstructor;
  };
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
 * Lists of contents drawn from the document under its template. After the template changes, a
 * host dispatches a transaction with `contentsKey` meta to draw them again.
 */
export function createContents({ template, labels = {} }: ContentsOptions): Contents {
  const plugin = new Plugin<ContentsState>({
    key: contentsKey,
    state: {
      init: (_config, state) => stateOf(state.doc, template()),
      apply: (tr, value) =>
        tr.docChanged || tr.getMeta(contentsKey) ? stateOf(tr.doc, template()) : value,
    },
    props: { decorations: (state) => contentsKey.getState(state)?.decorations ?? null },
  });
  const drawingFor = (
    node: ProseMirrorNode,
    rows: ContentsRows,
    navigate: (index: number) => void,
  ): Drawing => {
    const type = isContentsType(node.attrs.tocType) ? node.attrs.tocType : 'toc';
    return {
      rows,
      labels: { ...CONTENTS_LABELS[type], ...labels[type] },
      leader: template().styles?.contents?.leader || '.',
      navigate,
    };
  };
  return {
    plugin,
    nodeViews: {
      toc_block: (...[node, view, , decorations]) => {
        const dom = document.createElement('div');
        dom.className = 'de-contents';
        dom.contentEditable = 'false';
        let current = node;
        let rows = rowsIn(decorations);
        const navigate = (index: number) => {
          const entry = rows.entries[index];
          if (entry) goTo(view, entry);
        };
        const render = (next: ProseMirrorNode, decos: readonly Decoration[]) => {
          current = next;
          rows = rowsIn(decos);
          dom.dataset.contentsType = String(next.attrs.tocType);
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
      },
    },
  };
}
