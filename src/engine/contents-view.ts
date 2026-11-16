// Drawing a list of contents: its title, or what it shows when it lists nothing, then a row per
// entry with its number, text, leader and page, each carrying its level's custom properties; and
// copying rows as their text and page, without their leaders.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Decoration, EditorView } from 'prosemirror-view';
import type { CatalogEntry, ContentsListProperties, CustomProperties } from '../model/index.js';
import { chooseEntryWith } from './contents-keys.js';

/** A list's title, and what it shows when it lists nothing. */
export interface ContentsLabels {
  title: string;
  empty: string;
}

/** A list of contents' rows, as its block's decoration hands them to its view. */
export interface ContentsRows {
  readonly entries: readonly CatalogEntry[];
  readonly empty: boolean;
  /** Whether the entries show their page numbers. */
  readonly showPage: boolean;
}

// A short hash naming the rows a list draws, so pagination measures it again when they change.
function measureKey(
  node: ProseMirrorNode,
  { rows, labels, leaders, showPage, properties }: Drawing,
): string {
  const text = [
    String(node.attrs.showTitle),
    labels.title,
    labels.empty,
    leaders.map(String).join('|'),
    JSON.stringify(properties),
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

/** The rows a list block's decorations hand its view. */
export function rowsIn(decorations: readonly Decoration[]): ContentsRows {
  for (const decoration of decorations) {
    const rows = (decoration.spec as { contents?: ContentsRows }).contents;
    if (rows) return rows;
  }
  return { entries: [], empty: true, showPage: false };
}

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

/** What a list draws: its rows, labels, leaders and properties, and how an entry is chosen. */
export interface Drawing {
  readonly rows: ContentsRows;
  readonly labels: ContentsLabels;
  /** Each level's leader character, from level 1, or null for none. */
  readonly leaders: readonly (string | null)[];
  /** The custom properties of the list and of each level's rows, from the template. */
  readonly properties: ContentsListProperties;
  /** Whether the entries show their page numbers. */
  readonly showPage: boolean;
  /** Takes the reader to the entry at an index of the rows the list shows now. */
  readonly navigate: (index: number) => void;
}

// How many times a leader repeats: enough to fill the widest row, as the row clips it on the
// text's side.
const LEADER_LENGTH = 400;

function setProperties(element: HTMLElement, properties: CustomProperties | undefined) {
  for (const [name, value] of Object.entries(properties ?? {})) {
    element.style.setProperty(name, String(value));
  }
}

function drawEntry(entry: CatalogEntry, index: number, drawing: Drawing): HTMLElement {
  const row = document.createElement('div');
  const level = entry.level || 1;
  row.className = 'de-contents__entry';
  row.dataset.level = String(level);
  row.setAttribute('role', 'link');
  setProperties(row, drawing.properties.levels[level - 1]);
  if (entry.anchor) row.id = entry.anchor;
  if (entry.number) row.append(span('de-contents__number', entry.number));
  row.append(span('de-contents__text', entry.text));
  const character = drawing.leaders[level - 1] ?? null;
  if (character !== null && drawing.showPage) {
    // The leader is drawn from its attribute, so copying the row leaves it out; the space keeps
    // the text and the page apart in what is copied.
    const leader = span('de-contents__leader', ' ');
    leader.dataset.leader = character.repeat(Math.ceil(LEADER_LENGTH / character.length));
    leader.setAttribute('aria-hidden', 'true');
    row.append(leader);
  } else if (drawing.showPage) row.append(' ');
  if (drawing.showPage) row.append(span('de-contents__page', String(entry.page)));
  chooseEntryWith(row, index === 0, () => drawing.navigate(index));
  return row;
}

/** Draws a list's rows, unless it already shows them. */
export function draw(dom: HTMLElement, node: ProseMirrorNode, drawing: Drawing) {
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
  dom.removeAttribute('style');
  setProperties(dom, drawing.properties.list);
  dom.replaceChildren(...parts);
  dom.dataset.deMeasureKey = key;
}

/**
 * Copies the rows a selection in a list holds as their number, text and page, one space apart,
 * one row a line, without their leaders; false for a selection that does not start in a list.
 */
export function copyRows(view: EditorView, event: ClipboardEvent): boolean {
  const selection = view.dom.ownerDocument.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const start = range?.startContainer;
  const element = start?.nodeType === 1 ? (start as Element) : start?.parentElement;
  if (!range || range.collapsed || !element?.closest('.de-contents') || !event.clipboardData) {
    return false;
  }
  const lines = [...view.dom.querySelectorAll('.de-contents__entry')]
    .filter((row) => range.intersectsNode(row))
    .map((row) =>
      [...row.querySelectorAll('.de-contents__number, .de-contents__text, .de-contents__page')]
        .map((part) => part.textContent)
        .filter(Boolean)
        .join(' '),
    );
  if (!lines.length) return false;
  event.clipboardData.setData('text/plain', lines.join('\n'));
  event.preventDefault();
  return true;
}
