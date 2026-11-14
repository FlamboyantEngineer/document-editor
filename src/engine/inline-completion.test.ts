import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { CompletionAdapter, CompletionAvailability, HostResult } from '../host/index.js';
import { readDocumentFile } from '../model/index.js';
import { automationActor } from './automation.js';
import { createEditLock } from './edit-lock.js';
import {
  acceptCompletion,
  completionStatus,
  createInlineCompletion,
  dismissCompletion,
  inlineCompletion,
  type InlineCompletionOptions,
  offerCompletion,
  setInlineCompletionEnabled,
} from './inline-completion.js';
import { markDerived, markRemote } from './transaction-kind.js';

const provider: CompletionAdapter = {
  agent: 'agent-1',
  complete: () => Promise.resolve({ ok: true, value: { text: '' } }),
};

function stateAt(
  value: string,
  offset: number,
  options: Partial<InlineCompletionOptions> = {},
): EditorState {
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
  const plugins = [createInlineCompletion({ provider, ...options })];
  return EditorState.create({ doc, plugins, selection: TextSelection.create(doc, pos) });
}

const run = (state: EditorState, command: Command) => {
  let next = state;
  command(state, (tr) => (next = state.apply(tr)));
  return next;
};

describe('inline completion', () => {
  it('DOCE-AUTOMATION-3.2 takes an offer with its text, or dismisses it, and any change dismisses it', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = state.selection.head;
    state = run(state, offerCompletion({ pos, text: ' one second.' }));
    expect(inlineCompletion(state)).toEqual({ pos, text: ' one second.' });
    state = run(state, acceptCompletion);
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain(
      'Recovery takes one second.',
    );
    expect(inlineCompletion(state)).toBeNull();
    state = run(state, offerCompletion({ pos: state.selection.head, text: ' Done.' }));
    expect(dismissCompletion(state, (tr) => (state = state.apply(tr)))).toBe(true);
    expect(inlineCompletion(state)).toBeNull();
    state = run(state, offerCompletion({ pos: state.selection.head, text: ' Done.' }));
    state = state.apply(state.tr.insertText('!'));
    expect(inlineCompletion(state)).toBeNull();
    expect(offerCompletion({ pos: 1, text: 'x' })(state)).toBe(false);
  });

  it('DOCE-AUTOMATION-3.4 keeps an offer through changes that are not the writer’s, where the caret goes', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = state.selection.head;
    state = run(state, offerCompletion({ pos, text: ' one second.' }));
    // A check's result, a collaborator's caret, the layout's own write and a collaborator's text.
    state = state.apply(state.tr.setMeta('proofing', { issues: [] }));
    state = state.apply(
      markDerived(state.tr.setNodeAttribute(scopeAt(state) - 1, 'dataAuthor', 'ada')),
    );
    state = state.apply(markRemote(state.tr.insertText('Z', scopeAt(state) + 1)));
    expect(inlineCompletion(state)).toEqual({ pos: pos + 1, text: ' one second.' });
    expect(state.selection.head).toBe(pos + 1);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos + 1)));
    expect(inlineCompletion(state)?.text).toBe(' one second.');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    expect(inlineCompletion(state)).toBeNull();
  });

  it('DOCE-AUTOMATION-3.5 attributes a taken completion to the provider’s agent and session', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = state.selection.head;
    let taken: Parameters<typeof automationActor>[0] | null = null;
    state = run(state, offerCompletion({ pos, text: ' one second.', session: 's9' }));
    acceptCompletion(state, (tr) => {
      taken = tr;
      state = state.apply(tr);
    });
    expect(taken && automationActor(taken)).toEqual({
      id: 'agent-1',
      kind: 'agent',
      session: 's9',
    });
    const node = state.doc.nodeAt(pos);
    expect(node?.text).toBe(' one second.');
    const mark = node?.marks.find((each) => each.type.name === 'contributor');
    expect(mark?.attrs).toMatchObject({ dataAuthor: 'agent-1', dataAiSession: 's9' });
    expect(state.doc.nodeAt(pos - 1)?.marks.some((m) => m.type.name === 'contributor')).toBe(false);
  });

  it('DOCE-AUTOMATION-3.5 takes a completion as the agent’s suggestion while the writer suggests', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length, { suggesting: () => true });
    const pos = state.selection.head;
    state = run(state, offerCompletion({ pos, text: ' one second.' }));
    state = run(state, acceptCompletion);
    const marks = state.doc
      .nodeAt(pos)
      ?.marks.map((mark) => [mark.type.name, mark.attrs.dataAuthor]);
    expect(marks).toEqual(
      expect.arrayContaining([
        ['insertion', 'agent-1'],
        ['contributor', 'agent-1'],
      ]),
    );
    expect(state.selection.head).toBe(pos + ' one second.'.length);
  });

  it('DOCE-AUTOMATION-3.2 leaves Tab to the editor when the offer cannot be taken there', () => {
    const start = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = start.selection.head;
    const locked = start.reconfigure({
      plugins: [...start.plugins, createEditLock({ isLocked: () => true })],
    });
    const view = new EditorView(document.createElement('div'), {
      state: run(locked, offerCompletion({ pos, text: ' one second.' })),
    });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    const handled = view.someProp('handleKeyDown', (handle) => handle(view, tab));
    expect(handled).toBeFalsy();
    expect(tab.defaultPrevented).toBe(false);
    expect(acceptCompletion(view.state)).toBe(false);
    expect(view.state.doc.eq(locked.doc)).toBe(true);
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.7 turns off, dismissing its offer, and says where it stands', () => {
    let state = stateAt('Recovery takes', 'Recovery takes'.length);
    const pos = state.selection.head;
    expect(completionStatus(state)).toEqual({
      enabled: true,
      availability: { available: true },
      phase: 'idle',
    });
    state = run(state, offerCompletion({ pos, text: ' one second.' }));
    expect(completionStatus(state)?.phase).toBe('offered');
    state = run(state, setInlineCompletionEnabled(false));
    expect(completionStatus(state)).toMatchObject({ enabled: false, phase: 'idle' });
    expect(offerCompletion({ pos, text: ' one second.' })(state)).toBe(false);
    state = run(state, setInlineCompletionEnabled(true));
    expect(completionStatus(state)?.enabled).toBe(true);
    expect(completionStatus(EditorState.create({ schema: documentSchema }))).toBeNull();
  });
});

// A view with the caret at the end of its text, and a provider whose answers the test gives.
function asking(options: { availability?: () => CompletionAvailability } = {}) {
  const answers: ((result: HostResult<{ text: string; session?: string }>) => void)[] = [];
  const listeners: (() => void)[] = [];
  const complete = vi.fn<CompletionAdapter['complete']>(
    () => new Promise((resolve) => answers.push(resolve)),
  );
  const host: CompletionAdapter = {
    agent: 'agent-1',
    complete,
    ...(options.availability
      ? {
          availability: options.availability,
          subscribe: (listener: () => void) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
          },
        }
      : {}),
  };
  const start = stateAt('Recovery takes', 'Recovery takes'.length);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: start.doc,
      selection: start.selection,
      plugins: [createInlineCompletion({ provider: host, delay: 600 })],
    }),
  });
  const answer = async (text: string, session?: string) => {
    answers.shift()?.({ ok: true, value: { text, session } });
    await vi.advanceTimersByTimeAsync(0);
  };
  const changed = () => listeners.forEach((listener) => listener());
  return { view, complete, answer, changed };
}

// Types text as a key does: the key goes down, then its text goes in.
function type(view: EditorView, text: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: text.slice(-1), ...init });
  view.someProp('handleKeyDown', (handle) => handle(view, event));
  view.dispatch(view.state.tr.insertText(text));
}

// Where the first paragraph's text starts.
function scopeAt(view: EditorView | EditorState): number {
  const state = 'state' in view ? view.state : view;
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.endsWith('cope.')) found = pos;
  });
  return found;
}

describe('asking the provider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('DOCE-AUTOMATION-3.3 DOCE-HOST-1.23 asks once the writer pauses and offers the answer after the caret', async () => {
    vi.useFakeTimers();
    const { view, complete, answer } = asking();
    type(view, ' one');
    vi.advanceTimersByTime(599);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      before: 'Scope.\nRecovery takes one',
      after: '',
      blockType: 'paragraph',
    });
    expect(completionStatus(view.state)?.phase).toBe('asking');
    await answer(' second.', 's1');
    expect(inlineCompletion(view.state)).toEqual({
      pos: view.state.selection.head,
      text: ' second.',
      session: 's1',
    });
    expect(view.dom.querySelector('.de-inline-completion')).toHaveTextContent('second.');
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.3 drops an answer that comes after the writer typed on or moved the caret', async () => {
    vi.useFakeTimers();
    const { view, complete, answer } = asking();
    type(view, ' one');
    vi.advanceTimersByTime(600);
    type(view, ' more');
    await answer(' second.');
    expect(inlineCompletion(view.state)).toBeNull();
    vi.advanceTimersByTime(600);
    expect(complete).toHaveBeenCalledTimes(2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    await answer(' second.');
    expect(inlineCompletion(view.state)).toBeNull();
    expect(completionStatus(view.state)?.phase).toBe('idle');
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.4 offers an answer that comes after a collaborator’s change, a check’s result or the layout’s write', async () => {
    vi.useFakeTimers();
    const { view, answer } = asking();
    type(view, ' one');
    vi.advanceTimersByTime(600);
    view.dispatch(view.state.tr.setMeta('elsewhere', true));
    view.dispatch(markRemote(view.state.tr.insertText('Z', scopeAt(view) + 1)));
    view.dispatch(
      markDerived(view.state.tr.setNodeAttribute(scopeAt(view) - 1, 'dataAuthor', 'x')),
    );
    await answer(' second.');
    expect(inlineCompletion(view.state)).toEqual({
      pos: view.state.selection.head,
      text: ' second.',
    });
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.4 asks nothing for a collaborator’s change or an agent’s batch, and asks for the text as it is after the pause', async () => {
    vi.useFakeTimers();
    const { view, complete } = asking();
    view.dispatch(markRemote(view.state.tr.insertText('Z', scopeAt(view) + 1)));
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).not.toHaveBeenCalled();
    type(view, ' one');
    vi.advanceTimersByTime(300);
    view.dispatch(markRemote(view.state.tr.insertText('Y', scopeAt(view) + 1)));
    vi.advanceTimersByTime(300);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ before: 'SYZcope.\nRecovery takes one' });
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.6 asks after typed keys only: not after a paste, a composition or an edit with no key', async () => {
    vi.useFakeTimers();
    const { view, complete } = asking();
    view.dispatch(view.state.tr.insertText(' one'));
    type(view, ' pasted', { key: 'v', ctrlKey: true });
    type(view, ' 日本', { key: 'Process', isComposing: true });
    type(view, ' tab', { key: 'Tab' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(complete).not.toHaveBeenCalled();
    type(view, ' typed');
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.6 asks nothing in a footnote', async () => {
    vi.useFakeTimers();
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Body' },
                  {
                    type: 'footnote',
                    attrs: { id: 'n1' },
                    content: [{ type: 'text', text: 'Note' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    let inNote = -1;
    doc.descendants((node, pos, parent) => {
      if (node.isText && node.text === 'Note' && parent?.type.name === 'footnote_entry')
        inNote = pos + 4;
    });
    const complete = vi.fn<CompletionAdapter['complete']>();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, inNote > 0 ? inNote : 1),
        plugins: [createInlineCompletion({ provider: { agent: 'a', complete } })],
      }),
    });
    expect(view.state.selection.$head.parent.type.name).toBe('footnote_entry');
    type(view, 's');
    await vi.advanceTimersByTimeAsync(1000);
    expect(complete).not.toHaveBeenCalled();
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.7 asks nothing while off or while the provider is unavailable, and follows its availability', async () => {
    vi.useFakeTimers();
    let availability: CompletionAvailability = { available: false, reason: 'Offline' };
    const { view, complete, changed } = asking({ availability: () => availability });
    expect(completionStatus(view.state)?.availability).toEqual({
      available: false,
      reason: 'Offline',
    });
    type(view, ' one');
    await vi.advanceTimersByTimeAsync(1000);
    expect(complete).not.toHaveBeenCalled();
    availability = { available: true };
    changed();
    expect(completionStatus(view.state)?.availability).toEqual({ available: true });
    setInlineCompletionEnabled(false)(view.state, view.dispatch);
    type(view, ' two');
    await vi.advanceTimersByTimeAsync(1000);
    expect(complete).not.toHaveBeenCalled();
    setInlineCompletionEnabled(true)(view.state, view.dispatch);
    type(view, ' three');
    await vi.advanceTimersByTimeAsync(600);
    expect(complete).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('DOCE-AUTOMATION-3.8 offers the answer normalised, and nothing for an empty or failed one', async () => {
    vi.useFakeTimers();
    const { view, answer } = asking();
    type(view, ' one ');
    vi.advanceTimersByTime(600);
    await answer('  second.\nAnd more.');
    expect(inlineCompletion(view.state)?.text).toBe('second.');
    type(view, 'x');
    vi.advanceTimersByTime(600);
    await answer('   ');
    expect(inlineCompletion(view.state)).toBeNull();
    expect(completionStatus(view.state)?.phase).toBe('idle');
    view.destroy();
  });
});
