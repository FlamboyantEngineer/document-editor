import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { listSuggestions, type Suggestion } from './suggestion-decisions.js';
import {
  decideWithPolicy,
  suggestionPermissions,
  type SuggestionPolicy,
} from './suggestion-policy.js';

const part = (text: string, kind: 'insertion' | 'deletion', attrs: Record<string, string>) => ({
  type: 'text',
  text,
  marks: [{ type: kind, attrs }],
});
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
              { type: 'text', text: 'Alpha ' },
              part('mine', 'insertion', { id: 'm1', author: 'me' }),
              { type: 'text', text: ' ' },
              part('theirs', 'insertion', { id: 't1', author: 'them' }),
              { type: 'text', text: ' ' },
              part('opened', 'insertion', { id: 'o1', thread: 'th1' }),
            ] as StoredNode[],
          },
        ],
      },
    ],
  },
  documentSchema,
).doc;
const byId = (id: string) => listSuggestions(doc).find((each) => each.id === id) as Suggestion;

function decided(policy: SuggestionPolicy, decision: 'accept' | 'reject', id: string | null) {
  const state = EditorState.create({ doc });
  const ids = id === null ? null : new Set([id]);
  let left: string | null = null;
  decideWithPolicy(
    policy,
    decision,
    ids,
  )(state, (tr) => {
    const remaining = listSuggestions(tr.doc).map((each) => each.id);
    left = `${tr.doc.textContent} | ${remaining.join(' ')}`;
  });
  return left;
}

describe('the decide policy', () => {
  const suggesting: SuggestionPolicy = { me: 'me', canDecide: false, canWithdraw: true };

  it('DOCE-SUGGESTIONS-2.8 lets a suggesting writer withdraw only their own suggestions', () => {
    expect(suggestionPermissions(byId('m1'), suggesting)).toEqual({ accept: false, reject: true });
    expect(suggestionPermissions(byId('t1'), suggesting)).toEqual({ accept: false, reject: false });
    expect(decided(suggesting, 'reject', 'm1')).toBe('Alpha  theirs opened | t1 o1');
    expect(decided(suggesting, 'reject', 't1')).toBeNull();
    expect(decided(suggesting, 'accept', 'm1')).toBeNull();
    expect(decided({ ...suggesting, canWithdraw: false }, 'reject', 'm1')).toBeNull();
  });

  it('DOCE-SUGGESTIONS-2.8 counts a thread’s writer as an unattributed suggestion’s', () => {
    const policy = {
      ...suggesting,
      threadAuthor: (thread: string) => (thread === 'th1' ? 'me' : null),
    };
    expect(suggestionPermissions(byId('o1'), policy).reject).toBe(true);
  });

  it('DOCE-SUGGESTIONS-2.8 decides as the host narrows it, and every allowed one at once', () => {
    const policy: SuggestionPolicy = {
      me: 'me',
      canDecide: true,
      decide: (suggestion, me) => ({ accept: suggestion.author !== me, reject: true }),
    };
    expect(suggestionPermissions(byId('m1'), policy)).toEqual({ accept: false, reject: true });
    expect(decided(policy, 'accept', null)).toBe('Alpha mine theirs opened | m1');
  });
});
