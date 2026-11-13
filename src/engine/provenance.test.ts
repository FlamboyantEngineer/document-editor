import { history, redo, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { type Command, EditorState, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../test/document-markup.js';
import { documentAuthors } from './authorship.js';
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

// The state after a command, with what the plugins append to its transaction.
function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.applyTransaction(tr).state;
  });
  return next;
}

// Bea's editor over `markup`, with a history.
const beaEditing = (markup: string) =>
  EditorState.create({
    doc: parseMarkup(markup),
    plugins: [history(), createElementIds({ author: () => 'bea' })],
  });

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

  it('DOCE-COLLAB-3.3 marks a person typing in another person block, and not in their own', () => {
    const doc = parseMarkup(
      '<p data-id="aaaa0001" data-au="ada">One</p><p data-id="aaaa0002" data-au="bea">Two</p>',
    );
    let state = EditorState.create({ doc, plugins: [createElementIds({ author: () => 'bea' })] });
    state = state.applyTransaction(state.tr.insertText('!', 4)).state;
    state = state.applyTransaction(state.tr.insertText('?', state.doc.content.size - 1)).state;
    expect(runs(state.doc)).toEqual(['One:-', '!:bea/null', 'Two?:-']);
    expect(documentAuthors(state.doc).map(({ id, characters }) => [id, characters])).toEqual([
      ['bea', 5],
      ['ada', 3],
    ]);
  });

  it('DOCE-COLLAB-3.3 marks only the new text of a change that rewrites a whole text block', () => {
    const doc = parseMarkup('<p data-id="aaaa0001" data-au="ada">Hi</p>');
    const state = EditorState.create({ doc, plugins: [createElementIds({ author: () => 'bea' })] });
    const rewritten = state.tr.replaceWith(1, 3, state.schema.text('Hi!'));
    expect(runs(state.applyTransaction(rewritten).state.doc)).toEqual(['Hi:-', '!:bea/null']);
  });

  it('DOCE-COLLAB-3.3 keeps the writer of text an undo or a redo brings back', () => {
    const start = beaEditing(AGENT_TEXT);
    const deleted = start.applyTransaction(start.tr.delete(4, 9)).state;
    expect(runs(deleted.doc)).toEqual(['Hi :-']);
    const undone = run(deleted, undo);
    expect(runs(undone.doc)).toEqual(['Hi :-', 'there:agent/s1']);
    // Bea's own text an undo took away comes back as hers, the agent's still the agent's.
    const typed = undone.applyTransaction(undone.tr.insertText('!', 9)).state;
    expect(runs(run(run(typed, undo), redo).doc)).toEqual([
      'Hi :-',
      'there:agent/s1',
      '!:bea/null',
    ]);
  });

  it('DOCE-COLLAB-3.3 keeps another person’s block theirs when an undo restores its text', () => {
    const start = beaEditing('<p data-id="aaaa0001" data-au="ada">One two</p>');
    const deleted = start.applyTransaction(start.tr.delete(1, 4)).state;
    expect(runs(run(deleted, undo).doc)).toEqual(['One two:-']);
  });

  it('DOCE-COLLAB-3.3 leaves a change that lays pages out unmarked', () => {
    const page = (text: string) =>
      documentSchema.node('doc', null, [
        documentSchema.node('page_section', null, [
          documentSchema.node('page', null, [
            documentSchema.node('page_header', null, [documentSchema.node('paragraph')]),
            documentSchema.node('page_content', null, [
              documentSchema.node('paragraph', null, documentSchema.text(text)),
            ]),
            documentSchema.node('page_footnotes'),
            documentSchema.node('page_footer', null, [documentSchema.node('paragraph')]),
          ]),
        ]),
      ]);
    const doc = page('One');
    const state = EditorState.create({ doc, plugins: [createElementIds({ author: () => 'bea' })] });
    const laidOut = state.tr.replaceWith(0, doc.content.size, page('One more').content);
    expect(runs(state.applyTransaction(laidOut).state.doc).join()).not.toContain('bea');
  });
});
