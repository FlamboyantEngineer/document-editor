import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type {
  SelectionActionAnswer,
  SelectionActionRequest,
  SelectionActionsAdapter,
} from '../host/index.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import {
  runSelectionAction,
  selectionActionEdits,
  selectionPassages,
} from './selection-actions.js';
import { acceptAllSuggestions, listSuggestions } from './suggestion-decisions.js';

const paragraph = (id: string, value: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: value }],
});

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

// A view of two paragraphs with the text from `start` in the first to `end` in the second
// selected, by text offsets.
function viewOf(start: number, end: number) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { name: null, content: [paragraph('a1a1a1a1', 'One two'), paragraph('b2b2b2b2', 'Three')] },
      ],
    },
    documentSchema,
  ).doc;
  const starts: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) starts.push(pos + 1);
  });
  const [first = 0, second = 0] = starts;
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  const selection = TextSelection.create(doc, first + start, second + end);
  const view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(selection)),
  });
  views.push(view);
  return view;
}

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, '|');

// A provider answering with `answer` and keeping what it was asked.
function provider(answer: SelectionActionAnswer, asked: SelectionActionRequest[] = []) {
  const adapter: SelectionActionsAdapter = {
    agent: 'agent-1',
    run: (request) => {
      asked.push(request);
      return Promise.resolve({ ok: true, value: answer });
    },
  };
  return adapter;
}

describe('actions on the selected text', () => {
  it('DOCE-AUTOMATION-5.1 reads the selection as passages of element text', () => {
    const view = viewOf(4, 3);
    expect(selectionPassages(view.state)).toEqual([
      { elementId: 'a1a1a1a1', from: 4, to: 7, text: 'two', blockType: 'paragraph' },
      { elementId: 'b2b2b2b2', from: 0, to: 3, text: 'Thr', blockType: 'paragraph' },
    ]);
    const caret = view.state.apply(
      view.state.tr.setSelection(TextSelection.atStart(view.state.doc)),
    );
    expect(selectionPassages(caret)).toEqual([
      { elementId: 'a1a1a1a1', from: 0, to: 7, text: 'One two', blockType: 'paragraph' },
    ]);
  });

  it('DOCE-AUTOMATION-5.2 DOCE-HOST-1.25 records the replacements as the agent’s suggestions and opens its comments', async () => {
    const view = viewOf(0, 5);
    const asked: SelectionActionRequest[] = [];
    const adapter = provider(
      {
        replacements: [
          { elementId: 'a1a1a1a1', from: 0, to: 3, text: 'Uno' },
          { elementId: 'a1a1a1a1', from: 4, to: 7, text: 'dos' },
        ],
        comments: [{ elementId: 'b2b2b2b2', from: 0, to: 5, text: 'Spell it out?' }],
        session: 's1',
      },
      asked,
    );
    const result = await runSelectionAction(view, adapter, {
      action: 'translate',
      instruction: 'Into Spanish',
    });
    expect(asked.map(({ action, instruction }) => [action, instruction])).toEqual([
      ['translate', 'Into Spanish'],
    ]);
    expect(result.ok && result.threads.map(({ quote, text }) => [quote, text])).toEqual([
      ['Three', 'Spell it out?'],
    ]);
    const authors = new Set(listSuggestions(view.state.doc).map((each) => each.author));
    expect([...authors]).toEqual(['agent-1']);
    acceptAllSuggestions(view.state, view.dispatch);
    expect(textOf(view.state)).toBe('Uno dos|Three');
  });

  it('DOCE-AUTOMATION-5.2 writes directly when asked to', async () => {
    const view = viewOf(0, 0);
    const adapter = provider({
      replacements: [{ elementId: 'a1a1a1a1', from: 0, to: 7, text: 'Hi' }],
    });
    const result = await runSelectionAction(view, adapter, { action: 'shorten', mode: 'direct' });
    expect(result.ok).toBe(true);
    expect(textOf(view.state)).toBe('Hi|Three');
    expect(listSuggestions(view.state.doc)).toEqual([]);
  });

  it('DOCE-AUTOMATION-5.3 writes nothing over text the writer changed while the provider answered', async () => {
    const view = viewOf(0, 0);
    const adapter: SelectionActionsAdapter = {
      agent: 'agent-1',
      run: () => {
        view.dispatch(
          view.state.tr.insertText('Zero ', TextSelection.atStart(view.state.doc).from),
        );
        return Promise.resolve({
          ok: true,
          value: { replacements: [{ elementId: 'a1a1a1a1', from: 0, to: 3, text: 'Uno' }] },
        });
      },
    };
    const result = await runSelectionAction(view, adapter, { action: 'translate' });
    expect(result).toMatchObject({ ok: false, reason: 'refused', error: { kind: 'stale' } });
    expect(textOf(view.state)).toBe('Zero One two|Three');
  });

  it('DOCE-AUTOMATION-5.3 refuses changes outside the passages, a failed provider and an abort', async () => {
    const outside = selectionActionEdits(
      [{ elementId: 'a1a1a1a1', from: 4, to: 7, text: 'two', blockType: 'paragraph' }],
      { replacements: [{ elementId: 'a1a1a1a1', from: 0, to: 3, text: 'Uno' }] },
    );
    expect(outside).toEqual({ outside: 0 });
    const view = viewOf(0, 0);
    const failing: SelectionActionsAdapter = {
      agent: 'agent-1',
      run: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
    };
    expect(await runSelectionAction(view, failing, { action: 'review' })).toMatchObject({
      reason: 'host',
    });
    const controller = new AbortController();
    controller.abort();
    const answer = { replacements: [{ elementId: 'a1a1a1a1', from: 0, to: 3, text: 'Uno' }] };
    const aborted = await runSelectionAction(view, provider(answer), {
      action: 'review',
      signal: controller.signal,
    });
    expect(aborted).toMatchObject({ ok: false, reason: 'aborted' });
    expect(textOf(view.state)).toBe('One two|Three');
  });
});
