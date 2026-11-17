import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { ReferenceSourceAdapter } from '../host/index.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type ReferenceBaseline,
  type StoredNode,
} from '../model/index.js';
import {
  citationKey,
  createReferenceStatus,
  REFERENCE_STATUS_HINTS,
  referenceStatusAt,
  referenceUpdateText,
  refreshReferenceStatus,
  resolveCitations,
  updateReference,
} from './reference-status.js';
import { createReferences, listReferences } from './references.js';

const CITED: ReferenceBaseline = {
  version: 1,
  documentId: 'pwr-100',
  numbering: 'PWR-100',
  title: 'Power interface',
  revision: null,
  revisionLabel: 'Rev A',
  revisionId: 'snapshot-1',
  target: null,
  defaultLabel: 'PWR-100',
};
const KEY = citationKey({ documentId: 'pwr-100', targetId: null });
const source: ReferenceSourceAdapter = {
  search: () => Promise.resolve({ ok: true, value: [] }),
};
const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const cited = (baseline: ReferenceBaseline = CITED) => ({
  type: 'reference',
  attrs: {
    referenceType: 'external-document',
    baseline: JSON.stringify(baseline),
    target: 'pwr-100',
  },
});

function stateOf(content: StoredNode[], plugins = [createReferenceStatus({ source })]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc, plugins });
  const [first] = listReferences(doc);
  return state.apply(state.tr.setSelection(TextSelection.create(doc, (first?.from ?? 0) + 1)));
}

const record = (state: EditorState, answer: ReferenceBaseline | null | 'broken' | 'no-access') => {
  let next = state;
  resolveCitations(new Map([[KEY, answer]]))(state, (tr) => (next = state.apply(tr)));
  return next;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('reference status', () => {
  it('DOCE-REFERENCES-1.5 marks a citation whose document no longer holds its target broken, with a hint', () => {
    const state = record(
      stateOf([{ type: 'paragraph', content: [text('PWR-100', [cited()])] }]),
      'broken',
    );
    expect(referenceStatusAt(state)).toBe('broken');
    expect(updateReference(BASE_TEMPLATE)(state)).toBe(false);
    const view = new EditorView(document.createElement('div'), { state });
    const marked = view.dom.querySelector('[data-reference-status="broken"]');
    expect(marked?.getAttribute('title')).toBe(REFERENCE_STATUS_HINTS.broken);
    view.destroy();
  });

  it('DOCE-REFERENCES-1.5 sees a new snapshot of the revision cited as an update', () => {
    const state = stateOf([{ type: 'paragraph', content: [text('PWR-100', [cited()])] }]);
    expect(referenceStatusAt(record(state, { ...CITED }))).toBe('current');
    expect(referenceStatusAt(record(state, { ...CITED, revisionId: 'snapshot-2' }))).toBe('update');
  });

  it('DOCE-REFERENCES-1.5 takes an update rewriting only what changed, keeping the marks of the rest', () => {
    const state = stateOf([
      {
        type: 'paragraph',
        content: [
          text('See '),
          text('PWR-100', [{ type: 'bold' }, cited()]),
          text(' - Power interface', [cited()]),
          text(' and '),
          text('PWR-100 - Power interface', [cited()]),
        ],
      },
    ]);
    const updated = record(state, { ...CITED, title: 'Power bus' });
    expect(referenceUpdateText(updated, BASE_TEMPLATE)).toBe('PWR-100 - Power bus');
    let next = updated;
    expect(updateReference(BASE_TEMPLATE)(updated, (tr) => (next = updated.apply(tr)))).toBe(true);
    const texts = listReferences(next.doc).map((each) => next.doc.textBetween(each.from, each.to));
    // Only the citation at the selection changes; its number keeps its bold.
    expect(texts).toEqual(['PWR-100 - Power bus', 'PWR-100 - Power interface']);
    const strong = next.schema.marks.strong;
    let bold = '';
    next.doc.descendants((node) => {
      if (node.isText && strong?.isInSet(node.marks)) bold += node.text ?? '';
    });
    expect(bold).toBe('PWR-100');
  });

  it('DOCE-REFERENCES-1.9 keeps the status through a refresh the host fails', async () => {
    vi.useFakeTimers();
    const resolve = vi.fn<NonNullable<ReferenceSourceAdapter['resolve']>>();
    resolve.mockResolvedValueOnce({ ok: true, value: ['no-access'] });
    resolve.mockResolvedValueOnce({ ok: false, error: { kind: 'unavailable', message: 'down' } });
    const state = stateOf(
      [{ type: 'paragraph', content: [text('PWR-100', [cited()])] }],
      [createReferenceStatus({ source: { ...source, resolve }, delay: 10 })],
    );
    const view = new EditorView(document.createElement('div'), { state });
    await vi.advanceTimersByTimeAsync(20);
    expect(referenceStatusAt(view.state)).toBe('no-access');
    refreshReferenceStatus(view.state, view.dispatch);
    await vi.advanceTimersByTimeAsync(20);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(referenceStatusAt(view.state)).toBe('no-access');
    view.destroy();
  });

  it('DOCE-REFERENCES-1.5 DOCE-REFERENCES-1.3 tells the host of broken citations and references once', async () => {
    vi.useFakeTimers();
    const onBroken = vi.fn();
    const resolve = vi.fn<NonNullable<ReferenceSourceAdapter['resolve']>>(() =>
      Promise.resolve({ ok: true, value: ['broken'] }),
    );
    const state = stateOf(
      [{ type: 'paragraph', content: [text('PWR-100', [cited()])] }],
      [createReferenceStatus({ source: { ...source, resolve }, delay: 10, onBroken })],
    );
    const view = new EditorView(document.createElement('div'), { state });
    await vi.advanceTimersByTimeAsync(20);
    refreshReferenceStatus(view.state, view.dispatch);
    await vi.advanceTimersByTimeAsync(20);
    expect(onBroken).toHaveBeenCalledTimes(1);
    expect(onBroken).toHaveBeenCalledWith([{ documentId: 'pwr-100', targetId: null }]);
    view.destroy();
    // An internal reference whose target goes is told once too.
    const brokenTargets = vi.fn();
    const internal = stateOf(
      [
        { type: 'heading', attrs: { id: 'h1', level: 1 }, content: [text('Scope')] },
        {
          type: 'paragraph',
          content: [
            text('Scope', [
              { type: 'reference', attrs: { referenceType: 'internal-heading', target: 'h1' } },
            ]),
          ],
        },
      ],
      [createReferences({ template: () => BASE_TEMPLATE, onBroken: brokenTargets })],
    );
    let heading = 0;
    internal.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') heading = pos;
    });
    const gone = internal.apply(
      internal.tr.delete(heading, heading + (internal.doc.nodeAt(heading)?.nodeSize ?? 0)),
    );
    gone.apply(gone.tr.insertText('x', 1));
    expect(brokenTargets).toHaveBeenCalledTimes(1);
    expect(brokenTargets).toHaveBeenCalledWith(['h1']);
  });
});
