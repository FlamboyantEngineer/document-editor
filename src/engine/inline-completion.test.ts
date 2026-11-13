import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { CompletionAdapter, HostResult } from '../host/index.js';
import { readDocumentFile } from '../model/index.js';
import { type Actor, automationKey } from './automation.js';
import {
  acceptCompletion,
  completionRequest,
  createInlineCompletion,
  dismissCompletion,
  inlineCompletion,
  offerCompletion,
} from './inline-completion.js';
import { markRemote } from './transaction-kind.js';

const provider = { complete: () => Promise.resolve({ ok: true as const, value: '' }) };

function stateAt(value: string, offset: number) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Scope.' }] },
            { type: 'paragraph', content: [{ type: 'text', text: value }] },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let pos = -1;
  doc.descendants((node, at) => {
    if (node.isText && node.text === value) pos = at + offset;
  });
  const state = EditorState.create({ doc, plugins: [createInlineCompletion({ provider })] });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

describe('inline completion', () => {
  it('DOCE-AUTOMATION-3.1 asks for the text before the caret and the rest of its block', () => {
    const state = stateAt('Recovery takes time', 'Recovery takes'.length);
    expect(completionRequest(state)).toEqual({
      before: 'Scope.\nRecovery takes',
      after: ' time',
    });
    expect(completionRequest(state, 8)).toEqual({ before: 'ry takes', after: ' time' });
  });

  it('DOCE-AUTOMATION-3.2 takes an offer with its text, or dismisses it, and any change dismisses it', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = state.selection.head;
    offerCompletion({ pos, text: ' one second.' })(state, (tr) => (state = state.apply(tr)));
    expect(inlineCompletion(state)).toEqual({ pos, text: ' one second.' });
    acceptCompletion(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain(
      'Recovery takes one second.',
    );
    expect(inlineCompletion(state)).toBeNull();
    offerCompletion({ pos: state.selection.head, text: ' Done.' })(
      state,
      (tr) => (state = state.apply(tr)),
    );
    expect(dismissCompletion(state, (tr) => (state = state.apply(tr)))).toBe(true);
    expect(inlineCompletion(state)).toBeNull();
    offerCompletion({ pos: state.selection.head, text: ' Done.' })(
      state,
      (tr) => (state = state.apply(tr)),
    );
    state = state.apply(state.tr.insertText('!'));
    expect(inlineCompletion(state)).toBeNull();
    expect(offerCompletion({ pos: 1, text: 'x' })(state)).toBe(false);
  });
});

// A view with the caret at the end of its text, and a provider whose answers the test gives.
function asking() {
  const answers: ((result: HostResult<string>) => void)[] = [];
  const complete = vi.fn<CompletionAdapter['complete']>(
    () => new Promise((resolve) => answers.push(resolve)),
  );
  const start = stateAt('Recovery takes', 'Recovery takes'.length);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: start.doc,
      selection: start.selection,
      plugins: [createInlineCompletion({ provider: { complete }, delay: 600 })],
    }),
  });
  const answer = async (text: string) => {
    answers.shift()?.({ ok: true, value: text });
    await vi.advanceTimersByTimeAsync(0);
  };
  return { view, complete, answer };
}

// Where the first paragraph's text starts.
function scopeAt(view: EditorView): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'Scope.') found = pos;
  });
  return found;
}

describe('asking the provider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('DOCE-AUTOMATION-3.3 asks once the writer pauses and offers the answer after the caret', async () => {
    vi.useFakeTimers();
    const { view, complete, answer } = asking();
    view.dispatch(view.state.tr.insertText(' one'));
    vi.advanceTimersByTime(599);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ before: 'Scope.\nRecovery takes one' });
    await answer(' second.');
    expect(inlineCompletion(view.state)).toEqual({
      pos: view.state.selection.head,
      text: ' second.',
    });
    expect(view.dom.querySelector('.de-inline-completion')).toHaveTextContent('second.');
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.3 keeps the answer through a change of neither the text nor the caret', async () => {
    vi.useFakeTimers();
    const { view, answer } = asking();
    view.dispatch(view.state.tr.insertText(' one'));
    vi.advanceTimersByTime(600);
    // Such as a collaborator's caret moving, or a check's result coming in.
    view.dispatch(view.state.tr.setMeta('elsewhere', true));
    await answer(' second.');
    expect(inlineCompletion(view.state)?.text).toBe(' second.');
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.3 drops an answer that comes after the writer typed on or moved the caret', async () => {
    vi.useFakeTimers();
    const { view, complete, answer } = asking();
    view.dispatch(view.state.tr.insertText(' one'));
    vi.advanceTimersByTime(600);
    view.dispatch(view.state.tr.insertText(' more'));
    await answer(' second.');
    expect(inlineCompletion(view.state)).toBeNull();
    vi.advanceTimersByTime(600);
    expect(complete).toHaveBeenCalledTimes(2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    await answer(' second.');
    expect(inlineCompletion(view.state)).toBeNull();
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.3 asks nothing for a collaborator’s change or an agent’s batch while the writer is idle', async () => {
    vi.useFakeTimers();
    const { view, complete } = asking();
    view.dispatch(markRemote(view.state.tr.insertText('Z', scopeAt(view) + 1)));
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).not.toHaveBeenCalled();
    const agent: Actor = { id: 'agent-1', kind: 'agent' };
    view.dispatch(view.state.tr.insertText('Y', scopeAt(view) + 1).setMeta(automationKey, agent));
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).not.toHaveBeenCalled();
    expect(inlineCompletion(view.state)).toBeNull();
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.3 asks again, for the text as it is now, when a collaborator changes it during the pause', async () => {
    vi.useFakeTimers();
    const { view, complete, answer } = asking();
    view.dispatch(view.state.tr.insertText(' one'));
    vi.advanceTimersByTime(300);
    view.dispatch(markRemote(view.state.tr.insertText('Z', scopeAt(view) + 1)));
    vi.advanceTimersByTime(599);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ before: 'SZcope.\nRecovery takes one' });
    await answer(' second.');
    expect(inlineCompletion(view.state)?.pos).toBe(view.state.selection.head);
    view.destroy();
  });
});
