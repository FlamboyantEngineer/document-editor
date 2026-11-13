import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  applyEdits,
  automationActor,
  type AutomationEdit,
  type AutomationOptions,
} from './automation.js';
import { describeBlocks } from './automation-read.js';
import { listCommentAnchors } from './comments.js';
import { createEditLock } from './edit-lock.js';
import { listSuggestions } from './suggestion-decisions.js';

const paragraph = (id: string, value: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: value }],
});

const AGENT: AutomationOptions = {
  actor: { id: 'agent-1', kind: 'agent', session: 's1' },
  mode: 'direct',
};

function stateOf(...content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc });
}

const textOf = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, '|');

// Each run of text with the actors its contributor marks name.
function writers(state: EditorState): string[] {
  const runs: string[] = [];
  state.doc.descendants((node) => {
    if (!node.isText) return;
    const actors = node.marks
      .filter((mark) => mark.type.name === 'contributor')
      .map((mark) => String(mark.attrs.dataAuthor));
    runs.push(`${node.text ?? ''}:${actors.join('+')}`);
  });
  return runs;
}

function apply(
  state: EditorState,
  ...args: Parameters<typeof applyEdits> extends [unknown, ...infer R] ? R : never
) {
  const result = applyEdits(state, ...args);
  if (!result.ok) throw new Error(result.error.message);
  return { state: state.apply(result.tr), result };
}

describe('automation', () => {
  it('DOCE-AUTOMATION-1.1 reads each element once, with its text', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'First block'), paragraph('b2b2b2b2', 'Second'));
    expect(describeBlocks(state.doc)).toEqual([
      {
        elementId: 'a1a1a1a1',
        type: 'paragraph',
        text: 'First block',
        length: 11,
        parentId: null,
        section: 0,
        number: '',
      },
      {
        elementId: 'b2b2b2b2',
        type: 'paragraph',
        text: 'Second',
        length: 6,
        parentId: null,
        section: 0,
        number: '',
      },
    ]);
  });

  it('DOCE-AUTOMATION-1.2 inserts, replaces and deletes text by element and offset as one change', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'The log keeps a report.'));
    const { state: next, result } = apply(
      state,
      [
        {
          op: 'replaceText',
          at: { elementId: 'a1a1a1a1', from: 16, to: 22, expect: 'report' },
          text: 'record',
        },
        { op: 'insertText', at: { elementId: 'a1a1a1a1', from: 4 }, text: 'fault ' },
        { op: 'deleteText', at: { elementId: 'a1a1a1a1', from: 0, to: 4 } },
      ],
      AGENT,
    );
    expect(textOf(next)).toBe('fault log keeps a record.');
    if (result.ok) expect(automationActor(result.tr)?.id).toBe('agent-1');
    // The agent's text records who wrote it.
    const written: string[] = [];
    next.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.attrs.dataAuthor === 'agent-1')) {
        written.push(node.text ?? '');
      }
    });
    expect(written).toEqual(['fault ', 'record']);
  });

  it('DOCE-AUTOMATION-1.2 gives text written inside an actor’s text that actor’s mark alone', () => {
    const insert = (from: number, text: string) =>
      [{ op: 'insertText', at: { elementId: 'a1a1a1a1', from }, text }] as const;
    const first = apply(stateOf(paragraph('a1a1a1a1', 'The log.')), insert(4, 'fault '), AGENT);
    const other: AutomationOptions = { actor: { id: 'agent-2', kind: 'agent' }, mode: 'direct' };
    const second = apply(first.state, insert(6, 'XX'), other);
    const third = apply(second.state, insert(5, 'YY'), AGENT);
    expect(writers(third.state)).toEqual([
      'The :',
      'fYYa:agent-1',
      'XX:agent-2',
      'ult :agent-1',
      'log.:',
    ]);
    // The contributor mark excludes itself: a document holding two on one text is not valid.
    expect(() => {
      third.state.doc.check();
    }).not.toThrow();
  });

  it('DOCE-AUTOMATION-1.3 refuses a batch whole when an element is gone or its text changed', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'Keep this.'));
    const stale = applyEdits(
      state,
      [
        { op: 'insertText', at: { elementId: 'a1a1a1a1' }, text: '!' },
        {
          op: 'replaceText',
          at: { elementId: 'a1a1a1a1', from: 0, to: 4, expect: 'Drop' },
          text: 'x',
        },
      ],
      AGENT,
    );
    expect(stale).toMatchObject({ ok: false, error: { kind: 'stale', index: 1 } });
    const gone = applyEdits(state, [{ op: 'deleteBlock', elementId: 'ffffffff' }], AGENT);
    expect(gone).toMatchObject({ ok: false, error: { kind: 'not-found', index: 0 } });
    const outside = applyEdits(
      state,
      [{ op: 'deleteText', at: { elementId: 'a1a1a1a1', from: 3, to: 99 } }],
      AGENT,
    );
    expect(outside).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('DOCE-AUTOMATION-1.4 inserts, replaces and deletes blocks, attributed to the actor', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'One'), paragraph('b2b2b2b2', 'Two'));
    const { state: next } = apply(
      state,
      [
        { op: 'insertBlocks', after: 'a1a1a1a1', content: [paragraph('c3c3c3c3', 'Added')] },
        { op: 'replaceBlock', elementId: 'b2b2b2b2', content: [paragraph('d4d4d4d4', 'Swapped')] },
        { op: 'deleteBlock', elementId: 'a1a1a1a1' },
        { op: 'setAttrs', elementId: 'c3c3c3c3', attrs: { paragraphLevel: 2 } },
      ],
      AGENT,
    );
    expect(describeBlocks(next.doc).map((block) => block.text)).toEqual(['Added', 'Swapped']);
    let added = null as Record<string, unknown> | null;
    next.doc.descendants((node) => {
      if (node.attrs.dataId === 'c3c3c3c3') added = node.attrs;
    });
    expect(added).toMatchObject({ dataAuthor: 'agent-1', dataAiSession: 's1', paragraphLevel: 2 });
  });

  it('DOCE-AUTOMATION-1.5 records the changes as suggestions by the actor', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'The log keeps a report.'));
    const { state: next } = apply(
      state,
      [{ op: 'replaceText', at: { elementId: 'a1a1a1a1', from: 16, to: 22 }, text: 'record' }],
      { ...AGENT, mode: 'suggest', newId: () => 'e5e5e5e5' },
    );
    expect(textOf(next)).toBe('The log keeps a reportrecord.');
    const suggestions = listSuggestions(next.doc);
    expect(suggestions.map((each) => each.author)).toEqual(['agent-1']);
  });

  it('DOCE-AUTOMATION-1.6 anchors comment threads for the host to store', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'Check this limit.'));
    const { state: next, result } = apply(
      state,
      [{ op: 'comment', at: { elementId: 'a1a1a1a1', from: 11, to: 16 }, text: 'Too low?' }],
      { ...AGENT, newId: () => 'f6f6f6f6' },
    );
    expect(result.ok && result.threads).toEqual([
      { id: 'f6f6f6f6', quote: 'limit', text: 'Too low?', actor: AGENT.actor },
    ]);
    expect(listCommentAnchors(next.doc).map((anchor) => anchor.text)).toEqual(['limit']);
  });

  it('DOCE-AUTOMATION-1.7 refuses an edit at a locked position', () => {
    const doc = stateOf(paragraph('a1a1a1a1', 'Locked text')).doc;
    const state = EditorState.create({
      doc,
      plugins: [createEditLock({ isLocked: () => true })],
    });
    const result = applyEdits(
      state,
      [{ op: 'insertText', at: { elementId: 'a1a1a1a1' }, text: '!' }],
      AGENT,
    );
    expect(result).toMatchObject({ ok: false, error: { kind: 'locked' } });
  });

  it('DOCE-AUTOMATION-1.7 refuses an edit inside an embed or a script’s output, not one of the whole block', () => {
    const embed: StoredNode = {
      type: 'embed',
      attrs: { id: 'e0000001', kind: 'data-set', source: 'set-7', snapshot: 'r1', label: 'Set 7' },
      content: [paragraph('c3c3c3c3', 'Total 42')],
    };
    const script: StoredNode = {
      type: 'script',
      attrs: { id: 'f0000001', source: 'one' },
      content: [paragraph('d4d4d4d4', 'Ran one')],
    };
    const state = stateOf(paragraph('a1a1a1a1', 'Intro'), embed, script);
    const refusal = (...edits: AutomationEdit[]) => {
      const result = applyEdits(state, edits, AGENT);
      return result.ok ? null : result.error.kind;
    };
    expect(refusal({ op: 'replaceText', at: { elementId: 'c3c3c3c3' }, text: 'Total 0' })).toBe(
      'locked',
    );
    expect(refusal({ op: 'insertText', at: { elementId: 'd4d4d4d4' }, text: '!' })).toBe('locked');
    expect(refusal({ op: 'deleteBlock', elementId: 'd4d4d4d4' })).toBe('locked');
    expect(
      refusal({ op: 'insertBlocks', after: 'c3c3c3c3', content: [paragraph('e5e5e5e5', 'More')] }),
    ).toBe('locked');
    // A comment changes nothing an embed holds.
    expect(
      refusal({ op: 'comment', at: { elementId: 'c3c3c3c3', from: 0, to: 5 }, text: 'Check' }),
    ).toBeNull();
    // An embed's attributes are the host's too.
    expect(refusal({ op: 'setAttrs', elementId: 'e0000001', attrs: { label: 'Other' } })).toBe(
      'locked',
    );
    const around = apply(
      state,
      [
        { op: 'insertBlocks', after: 'e0000001', content: [paragraph('e5e5e5e5', 'Beside')] },
        { op: 'deleteBlock', elementId: 'f0000001' },
      ],
      AGENT,
    );
    expect(textOf(around.state)).toBe('Intro|Total 42|Beside');
  });

  it('DOCE-AUTOMATION-1.2 edits an element the pages split as one', () => {
    const state = stateOf(paragraph('a1a1a1a1', 'Whole paragraph'));
    const { state: next } = apply(
      state,
      [{ op: 'insertText', at: { elementId: 'a1a1a1a1', from: 5 }, text: ' new' }],
      AGENT,
    );
    expect(textOf(next)).toBe('Whole new paragraph');
  });
});
