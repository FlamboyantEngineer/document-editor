import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { EMPTY_AI_SESSION } from '../model/schema/dom-attributes.js';
import { type Actor, applyEdits, type AutomationEdit } from './automation.js';
import { acceptSuggestion, listSuggestions } from './suggestion-decisions.js';
import { decideWithPolicy } from './suggestion-policy.js';

const PARAGRAPH: StoredNode = {
  type: 'paragraph',
  attrs: { id: 'a1a1a1a1' },
  content: [{ type: 'text', text: 'The log.' }],
};
const INSERT: readonly AutomationEdit[] = [
  { op: 'insertText', at: { elementId: 'a1a1a1a1', from: 4 }, text: 'fault ' },
];

// The paragraph with `fault ` inserted by an actor, directly or as their suggestion.
function written(actor: Actor, mode: 'direct' | 'suggest'): EditorState {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [PARAGRAPH] }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  const result = applyEdits(state, INSERT, { actor, mode, newId: () => 's0000001' });
  if (!result.ok) throw new Error(result.error.message);
  return state.apply(result.tr);
}

// Who the inserted text is credited to, and the session it is marked with.
function creditOf(state: EditorState): readonly [unknown, unknown] | null {
  let found: readonly [unknown, unknown] | null = null;
  state.doc.descendants((node) => {
    const mark = node.marks.find((each) => each.type.name === 'contributor');
    if (node.text === 'fault ' && mark) found = [mark.attrs.dataAuthor, mark.attrs.dataAiSession];
  });
  return found;
}

// Accepts every suggestion as a reader who may decide.
function accepted(state: EditorState, me: string | null): EditorState {
  let next = state;
  const policy = { me, canDecide: true };
  decideWithPolicy(policy, 'accept')(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

const agent = (session?: string): Actor => ({
  id: 'agent-1',
  kind: 'agent',
  ...(session ? { session } : {}),
});

describe('accepted generated text', () => {
  it('DOCE-AUTOMATION-1.2 marks an agent’s text as generated even when it names no session', () => {
    expect(creditOf(written(agent('s1'), 'direct'))).toEqual(['agent-1', 's1']);
    expect(creditOf(written(agent(), 'direct'))).toEqual(['agent-1', EMPTY_AI_SESSION]);
    expect(creditOf(written({ id: 'script', kind: 'system' }, 'direct'))).toEqual(['script', null]);
  });

  it('DOCE-SUGGESTIONS-2.7 credits an agent’s accepted suggestion to the person who accepts it, still marked generated', () => {
    expect(creditOf(accepted(written(agent('s1'), 'suggest'), 'reviewer'))).toEqual([
      'reviewer',
      's1',
    ]);
    expect(creditOf(accepted(written(agent(), 'suggest'), 'reviewer'))).toEqual([
      'reviewer',
      EMPTY_AI_SESSION,
    ]);
  });

  it('DOCE-SUGGESTIONS-2.7 leaves generated text the agent’s when no one is known to accept it', () => {
    const suggested = written(agent('s1'), 'suggest');
    expect(creditOf(accepted(suggested, null))).toEqual(['agent-1', 's1']);
    const [suggestion] = listSuggestions(suggested.doc);
    let next = suggested;
    acceptSuggestion(suggestion?.id ?? '')(suggested, (tr) => {
      next = suggested.apply(tr);
    });
    expect(creditOf(next)).toEqual(['agent-1', 's1']);
  });

  it('DOCE-SUGGESTIONS-2.7 keeps a person’s accepted suggestion theirs, whoever accepts it', () => {
    const person: Actor = { id: 'writer', kind: 'human' };
    expect(creditOf(accepted(written(person, 'suggest'), 'reviewer'))).toEqual(['writer', null]);
  });
});
