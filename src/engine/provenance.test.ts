import type { Node } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { automationKey } from './automation.js';
import { createElementIds } from './element-ids.js';
import { markRemote } from './transaction-kind.js';

const AGENT_TEXT = '<p data-id="aaaa0001">Hi <span data-au="agent" data-ai="s1">there</span></p>';

// The writer of each run of a document's text: its contributor mark's author and session.
function runs(doc: Node): string[] {
  const found: string[] = [];
  doc.descendants((node) => {
    if (!node.isText) return true;
    const mark = node.marks.find((each) => each.type.name === 'contributor');
    const writer = mark
      ? `${String(mark.attrs.dataAuthor)}/${String(mark.attrs.dataAiSession)}`
      : '-';
    found.push(`${node.text ?? ''}:${writer}`);
    return false;
  });
  return found;
}

function typeAfterAgent(
  author: string | null,
  prepare: (tr: Transaction) => Transaction = (tr) => tr,
) {
  const doc = parseMarkup(AGENT_TEXT);
  const state = EditorState.create({ doc, plugins: [createElementIds({ author: () => author })] });
  const end = 1 + doc.child(0).content.size;
  // Typed text takes the marks at the caret, as the contributor mark is inclusive.
  const typed = state.tr.insertText('!', end);
  return state.applyTransaction(prepare(typed)).state.doc;
}

describe('contributor marks', () => {
  it('DOCE-COLLAB-3.3 marks a person typing after agent text as theirs', () => {
    expect(runs(typeAfterAgent('ada'))).toEqual(['Hi :-', 'there:agent/s1', '!:ada/null']);
  });

  it('DOCE-COLLAB-3.3 leaves typing unmarked when the editor knows no writer', () => {
    expect(runs(typeAfterAgent(null))).toEqual(['Hi :-', 'there:agent/s1', '!:-']);
  });

  it('DOCE-COLLAB-3.3 leaves remote changes and the automation API alone', () => {
    expect(runs(typeAfterAgent('ada', markRemote))).toEqual(['Hi :-', 'there!:agent/s1']);
    const automated = (tr: Transaction) =>
      tr.setMeta(automationKey, { kind: 'agent', id: 'agent', session: 's1' });
    expect(runs(typeAfterAgent('ada', automated))).toEqual(['Hi :-', 'there!:agent/s1']);
  });

  it('DOCE-COLLAB-3.3 marks pasted blocks as the paster', () => {
    const doc = parseMarkup('<p data-id="aaaa0001">One</p>');
    const state = EditorState.create({ doc, plugins: [createElementIds({ author: () => 'bea' })] });
    const pasted = parseMarkup('<p>Two</p>').content;
    const next = state.applyTransaction(state.tr.insert(doc.content.size, pasted)).state;
    expect(runs(next.doc)).toEqual(['One:-', 'Two:bea/null']);
  });
});
