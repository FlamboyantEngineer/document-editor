// A paged projection in the test DOM, for the tests of what runs on its pages: a canonical state
// of paragraphs, a layout that measures each of them alike, and frames the test draws itself.

import { history } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state';
import { vi } from 'vitest';
import { readDocumentFile } from '../src/model/index.js';
import {
  createProjectionView,
  type ProjectionViewOptions,
} from '../src/pagination/projection-view.js';
import { documentSchema } from './document-markup.js';

export const PARAGRAPH_HEIGHT = 400;
export const TEXTS = ['Alpha one', 'Beta two', 'Gamma three', 'Delta four', 'Epsilon five'];

// How the test DOM lays out: each paragraph `height` pixels tall, 400 by default so that pages
// 1,000 pixels tall hold two paragraphs each; every other element and range measures as empty.
// With `boxes`, elements are drawn with boxes, so the pages, drawn with no height, overflow.
export interface StubbedLayout {
  readonly height?: number;
  readonly boxes?: boolean;
}

export function stubLayout({ height = PARAGRAPH_HEIGHT, boxes = false }: StubbedLayout) {
  Object.assign(Range.prototype, {
    getBoundingClientRect: () => new DOMRect(),
    getClientRects: (): DOMRect[] => [],
  });
  const rect = (element: HTMLElement) =>
    new DOMRect(0, 0, 100, element.tagName === 'P' ? height : 0);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return rect(this);
  });
  if (!boxes) return;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return [rect(this)] as unknown as DOMRectList;
  });
}

export function canonicalState(plugins: readonly Plugin[] = [], texts = TEXTS): EditorState {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [history(), ...plugins] });
}

export function mount(options: Partial<ProjectionViewOptions> = {}, layout: StubbedLayout = {}) {
  stubLayout(layout);
  const queue: (() => void)[] = [];
  const projection = createProjectionView({
    mount: document.body.appendChild(document.createElement('div')),
    measureIn: document.body.appendChild(document.createElement('div')),
    state: canonicalState(),
    pageHeight: 1000,
    settle: 0,
    schedule: (run) => {
      queue.push(run);
      return () => {
        const at = queue.indexOf(run);
        if (at >= 0) queue.splice(at, 1);
      };
    },
    ...options,
  });
  // Draws the next frame: what was scheduled before it.
  const next = () => {
    for (const run of queue.splice(0)) run();
  };
  const drain = () => {
    while (queue.length) next();
  };
  return { projection, next, drain };
}

// Has the host make a change to the canonical state and show it on the projection.
export function edit(
  projection: { readonly state: EditorState; update(state: EditorState, tr: Transaction): void },
  make: (state: EditorState) => Transaction,
) {
  const tr = make(projection.state);
  projection.update(projection.state.apply(tr), tr);
}

export const pageCount = (doc: ProseMirrorNode) => doc.child(0).childCount;
export const textOf = (doc: ProseMirrorNode) => doc.textContent;

// The position just before some text.
export function positionOf(doc: ProseMirrorNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) found = pos + index;
    return false;
  });
  if (found < 0) throw new Error(text);
  return found;
}
