import type { RichTextEngineCommit } from '@flamboyantengineer/ui-components/rich-text-editor';
import { renderHook } from '@testing-library/react';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { PagedProjection } from '../../pagination/index.js';
import { type PagedEditor, usePagedEditor, usePagedView } from './use-paged-projection.js';

const { doc, paragraph } = {
  doc: documentSchema.nodes.doc,
  paragraph: documentSchema.nodes.paragraph,
};

function stateOf(text: string) {
  const content = doc?.createAndFill(null, paragraph?.create(null, documentSchema.text(text)));
  if (!content) throw new Error('The schema has no paragraph.');
  return EditorState.create({ doc: content });
}

// A dispatch body that commits every transaction as it is.
const commitAll = (_tr: Transaction, _view: EditorView, commit: { applyDefault(): void }) =>
  commit.applyDefault();

describe('usePagedEditor', () => {
  it('DOCE-PAGINATION-7.17 takes a transaction the host did not commit back to the state before it, not the state React last drew', () => {
    const drawn = stateOf('Check the unit');
    // The pages have since sent a selection the host has not drawn yet, then a transaction the
    // host takes as an update of its own, as proofing results.
    const selected = drawn.apply(
      drawn.tr.setSelection(TextSelection.create(drawn.doc, 11, drawn.doc.content.size - 1)),
    );
    const tr = selected.tr.setMeta('addToHistory', false);
    const after = selected.apply(tr);
    const update = vi.fn();
    const projection = { state: after, update } as unknown as PagedProjection;
    const onStateChange = vi.fn();
    const { result } = renderHook(() =>
      usePagedEditor({
        state: drawn,
        onStateChange,
        body: (_tr, _view, _commit) => onStateChange(),
        events: {},
      }),
    );
    result.current.targetRef.current = {
      projection,
      host: drawn,
      view: {} as EditorView,
    };
    result.current.onCanonical(tr, { from: selected, to: after });
    expect(update).toHaveBeenCalledWith(selected);
    expect(update).not.toHaveBeenCalledWith(drawn);
  });

  it('DOCE-PAGINATION-7.26 gives the pages the state the host takes for a transaction its body rewrote', () => {
    const from = stateOf('Check the unit');
    const tr = from.tr.insertText('x', 1);
    const made = { from, to: from.apply(tr) };
    let host = from;
    const onStateChange = (next: (state: EditorState) => EditorState) => {
      host = next(host);
    };
    // As suggesting rewrites typed text: another transaction on the same state.
    const body = (_tr: Transaction, view: EditorView, commit: RichTextEngineCommit) =>
      commit.applyDefault(view.state.tr.insertText('y', 1));
    const { result } = renderHook(() =>
      usePagedEditor({ state: from, onStateChange, body, events: {} }),
    );
    const update = vi.fn();
    const projection = { state: made.to, update } as unknown as PagedProjection;
    result.current.targetRef.current = { projection, host: from, view: {} as EditorView };
    const taken = result.current.onCanonical(tr, made);
    expect(taken?.state.doc.textContent).toBe('yCheck the unit');
    expect(host).toBe(taken?.state);
    // A transaction the body commits as it is leaves the pages' state as they made it.
    const plain = renderHook(() =>
      usePagedEditor({ state: from, onStateChange: vi.fn(), body: commitAll, events: {} }),
    ).result.current;
    plain.targetRef.current = { projection, host: from, view: {} as EditorView };
    expect(plain.onCanonical(tr, made)).toBeUndefined();
  });

  it('DOCE-PAGINATION-7.26 rewrites a transaction on the state the pages made it on while the host lags', () => {
    const drawn = stateOf('Check the unit');
    // The pages' last edit, which the host has not drawn yet: its updater waits.
    const from = drawn.apply(drawn.tr.insertText('a', 1));
    const tr = from.tr.insertText('x', 2);
    const made = { from, to: from.apply(tr) };
    const waiting: ((state: EditorState) => EditorState)[] = [];
    const seen: EditorState[] = [];
    const body = (_tr: Transaction, view: EditorView, commit: RichTextEngineCommit) => {
      seen.push(view.state);
      commit.applyDefault(view.state.tr.insertText('y', 2));
    };
    const { result } = renderHook(() =>
      usePagedEditor({
        state: drawn,
        onStateChange: (next) => waiting.push(next),
        body,
        events: {},
      }),
    );
    const projection = { state: made.to, update: vi.fn() } as unknown as PagedProjection;
    result.current.targetRef.current = { projection, host: drawn, view: {} as EditorView };
    const taken = result.current.onCanonical(tr, made);
    expect(seen[0]).toBe(from);
    expect(taken?.state.doc.textContent).toBe('ayCheck the unit');
    // The host, catching up, takes the state the pages hold.
    expect(waiting.at(-1)?.(from)).toBe(taken?.state);
  });
});

describe('usePagedView', () => {
  it('DOCE-PAGINATION-7.25 does not show the pages a host state of their own that a later commit of theirs has passed', () => {
    const opened = stateOf('alpha beta gamma');
    const update = vi.fn();
    const projection = { state: opened, update, canonicalView: (view: EditorView) => view };
    const paged = { projection, state: opened } as unknown as PagedEditor;
    let host = opened;
    const onStateChange = (next: (state: EditorState) => EditorState) => {
      host = next(host);
    };
    const editor = renderHook(() =>
      usePagedEditor({ state: opened, onStateChange, body: commitAll, events: {} }),
    ).result.current;
    editor.targetRef.current = { projection: paged.projection, host, view: {} as EditorView };
    // A caret the pages sent after a key, then Mod-Home's caret, both committed by the host.
    editor.onCanonical(opened.tr.setSelection(TextSelection.create(opened.doc, 12)));
    const keyed = host;
    editor.onCanonical(keyed.tr.setSelection(TextSelection.create(keyed.doc, 1)));
    const homed = host;
    const view = { state: opened } as unknown as EditorView;
    const { rerender } = renderHook(
      ({ state }) =>
        usePagedView(paged, view, { state, targetRef: editor.targetRef, own: editor.own }),
      { initialProps: { state: keyed } },
    );
    // React committed the render of the first caret after the second reached the projection.
    expect(update).not.toHaveBeenCalledWith(keyed);
    rerender({ state: homed });
    expect(update).toHaveBeenCalledWith(homed);
  });
});

describe('usePagedView while the host has not taken a commit', () => {
  it('DOCE-PAGINATION-7.25 shows a host state of its own on the pages with the caret the pages have sent', () => {
    const opened = stateOf('alpha beta gamma');
    const moved = opened.apply(opened.tr.setSelection(TextSelection.create(opened.doc, 7)));
    const update = vi.fn();
    const projection = { state: moved, update, canonicalView: (view: EditorView) => view };
    const paged = { projection, state: moved } as unknown as PagedEditor;
    // The host queues the pages' commit and renders a state of its own made before it runs.
    const queued: ((state: EditorState) => EditorState)[] = [];
    const editor = renderHook(() =>
      usePagedEditor({
        state: opened,
        onStateChange: (next) => queued.push(next),
        body: commitAll,
        events: {},
      }),
    ).result.current;
    editor.targetRef.current = {
      projection: paged.projection,
      host: opened,
      view: {} as EditorView,
    };
    editor.onCanonical(opened.tr.setSelection(TextSelection.create(opened.doc, 7)));
    const own = opened.apply(opened.tr.setMeta('addToHistory', false));
    const view = { state: moved } as unknown as EditorView;
    renderHook(() =>
      usePagedView(paged, view, { state: own, targetRef: editor.targetRef, own: editor.own }),
    );
    const shown = update.mock.calls.at(-1)?.[0] as EditorState | undefined;
    expect(shown?.doc).toBe(own.doc);
    expect(shown?.selection.head).toBe(7);
  });
});
