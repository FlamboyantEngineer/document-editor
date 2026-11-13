import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { createWordListProofer, type ProofingIssue } from '../host/index.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  createProofing,
  isProofingPending,
  proofingKey,
  proofingUpdate,
  type SourcedIssue,
} from './proofing.js';
import {
  addProofingWord,
  countAlikeIssues,
  disableProofingRule,
  ignoreProofingIssue,
  ignoreProofingOnce,
  listProofingIssues,
  PROOFING_FLASH,
  proofingIssueAt,
  recheckProofing,
  replaceAllProofingIssues,
  replaceProofingIssue,
  revealSelectedProofingIssue,
  selectNextProofingIssue,
  setProofingLanguage,
} from './proofing-commands.js';
import { segmentsOf } from './proofing-text.js';

const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

const newProofer = () =>
  createWordListProofer({
    corrections: { teh: ['the'], recieve: ['receive'] },
    grammar: { 'a apple': { message: 'Use an before a vowel.', suggestions: ['an apple'] } },
  });

function stateOf(...content: StoredNode[]) {
  const proofer = newProofer();
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createProofing({ proofer })] });
}

// The state once the proofer's answer for every unchecked text has come back, as the plugin's view
// dispatches it.
async function checked(state: EditorState): Promise<EditorState> {
  const texts: string[] = [];
  state.doc.descendants((node) => {
    if (!node.isTextblock) return true;
    let value = '';
    node.forEach((child) => {
      const skipped = child.marks.some((mark) => ['code', 'deletion'].includes(mark.type.name));
      value += child.isText ? (skipped ? ' '.repeat(child.text?.length ?? 0) : child.text) : ' ';
    });
    if (value.trim()) texts.push(value);
    return false;
  });
  const proofer = proofingKey.getState(state)?.proofers[0];
  if (!proofer) throw new Error('The document is proofed');
  const found = await proofer.check(
    texts.map((value) => ({ text: value })),
    { signal: new AbortController().signal },
  );
  const results = new Map<string, readonly SourcedIssue[]>(
    texts.map((value, index) => [
      value,
      (found[index] ?? []).map((issue: ProofingIssue) => ({ ...issue, source: 0 })),
    ]),
  );
  return state.apply(state.tr.setMeta(proofingKey, { results, status: 'ready' }));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

const issueTexts = (state: EditorState) =>
  listProofingIssues(state).map((issue) => `${issue.kind}:${issue.text}`);

describe('proofing', () => {
  it('DOCE-PROOFING-1.2 marks the issues the proofer finds, in document order', async () => {
    const state = await checked(
      stateOf(paragraph(text('Teh report.')), paragraph(text('We recieve a apple.'))),
    );
    expect(issueTexts(state)).toEqual(['spelling:Teh', 'spelling:recieve', 'grammar:a apple']);
    const first = listProofingIssues(state)[0];
    expect(first?.suggestions).toEqual(['The']);
    expect(state.doc.textBetween(first?.from ?? 0, first?.to ?? 0)).toBe('Teh');
    const grammar = proofingIssueAt(state, (listProofingIssues(state)[2]?.from ?? 0) + 1);
    expect(grammar?.message).toBe('Use an before a vowel.');
  });

  it('DOCE-PROOFING-1.1 leaves out code and text a suggestion deletes', async () => {
    const state = await checked(
      stateOf(
        paragraph(
          text('teh', [{ type: 'code' }]),
          text(' recieve', [{ type: 'deletion', attrs: { id: 's1', author: 'lab' } }]),
          text(' and teh'),
        ),
        {
          type: 'codeBlock',
          content: [text('teh')],
        },
      ),
    );
    expect(issueTexts(state)).toEqual(['spelling:teh']);
    expect(listProofingIssues(state)[0]?.from).toBeGreaterThan(12);
  });

  it('DOCE-PROOFING-1.3 drops the mark of a word the writer changes until it is checked again', async () => {
    const state = await checked(stateOf(paragraph(text('Teh report and teh end.'))));
    const [first] = listProofingIssues(state);
    if (!first) throw new Error('An issue is marked');
    const typed = state.apply(state.tr.insertText('x', first.from + 1));
    expect(issueTexts(typed)).toEqual(['spelling:teh']);
    const moved = listProofingIssues(typed)[0];
    expect(typed.doc.textBetween(moved?.from ?? 0, moved?.to ?? 0)).toBe('teh');
  });

  it('DOCE-PROOFING-2.1 replaces an issue with a suggestion, keeping its marks', async () => {
    const state = await checked(stateOf(paragraph(text('Teh report', [{ type: 'strong' }]))));
    const [issue] = listProofingIssues(state);
    if (!issue) throw new Error('An issue is marked');
    const next = run(state, replaceProofingIssue(issue, 'The'));
    expect(next.doc.textBetween(0, next.doc.content.size)).toBe('The report');
    expect(
      next.doc
        .resolve(issue.from + 1)
        .marks()
        .map((mark) => mark.type.name),
    ).toEqual(['strong']);
    expect(replaceProofingIssue(issue, 'The')(next)).toBe(false);
  });

  it('DOCE-PROOFING-2.2 DOCE-PROOFING-3.3 DOCE-HOST-1.7 ignores a word everywhere and adds it to the dictionary', async () => {
    const state = await checked(stateOf(paragraph(text('teh and teh and recieve'))));
    const [issue] = listProofingIssues(state);
    if (!issue) throw new Error('An issue is marked');
    expect(issueTexts(run(state, ignoreProofingIssue(issue)))).toEqual(['spelling:recieve']);
    const added = run(state, addProofingWord(issue));
    expect(issueTexts(added)).toEqual(['spelling:recieve']);
    const proofer = proofingKey.getState(added)?.proofers[0];
    const again = await proofer?.check([{ text: 'teh' }], {
      signal: new AbortController().signal,
    });
    expect(again?.[0]).toEqual([]);
  });

  it('DOCE-PROOFING-2.3 selects the next issue after the selection, wrapping around', async () => {
    let state = await checked(stateOf(paragraph(text('teh one, recieve two'))));
    const [first, second] = listProofingIssues(state);
    state = run(state, selectNextProofingIssue);
    expect(state.selection.from).toBe(first?.from);
    state = run(state, selectNextProofingIssue);
    expect(state.selection.from).toBe(second?.from);
    state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
    state = run(state, selectNextProofingIssue);
    expect(state.selection.from).toBe(first?.from);
    expect(selectNextProofingIssue(stateOf(paragraph(text('Clean'))))).toBe(false);
  });

  it('DOCE-PROOFING-3.6 flashes the issue it reveals as a decoration the view draws', async () => {
    vi.useFakeTimers();
    try {
      const state = await checked(stateOf(paragraph(text('A teh report.'))));
      const view = new EditorView(document.createElement('div'), { state });
      selectNextProofingIssue(view.state, view.dispatch);
      expect(revealSelectedProofingIssue(view)).toMatchObject({ index: 0, total: 1 });
      expect(view.dom.querySelector('[data-proofing-flash]')?.textContent).toBe('teh');
      vi.advanceTimersByTime(PROOFING_FLASH);
      expect(view.dom.querySelector('[data-proofing-flash]')).toBeNull();
      expect(view.dom.querySelector('[data-proofing-issue]')?.textContent).toBe('teh');
      view.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('DOCE-PROOFING-1.4 commits proofing results on a state the writer has typed past', async () => {
    const state = stateOf(paragraph(text('Teh report')));
    const stale = (await checked(state)).tr;
    const results = new Map([
      [
        'Teh report',
        [{ from: 0, to: 3, kind: 'spelling' as const, suggestions: ['The'], source: 0 }],
      ],
    ]);
    const late = state.tr.setMeta(proofingKey, { results, status: 'ready' });
    const typed = state.apply(state.tr.insertText('!', state.doc.content.size - 2));
    const update = proofingUpdate(late);
    if (!update) throw new Error('A proofing transaction has an update');
    const next = update(typed);
    expect(next.doc.textBetween(0, next.doc.content.size)).toContain('!');
    expect(proofingUpdate(stale.insertText('x', 4))).toBeNull();
  });

  it('DOCE-PROOFING-2.4 replaces every issue like one as one change', async () => {
    const state = await checked(stateOf(paragraph(text('teh one and teh two, recieve'))));
    const [first] = listProofingIssues(state);
    if (!first) throw new Error('An issue is marked');
    expect(countAlikeIssues(state, first)).toBe(2);
    const next = run(state, replaceAllProofingIssues(first, 'the'));
    expect(next.doc.textBetween(0, next.doc.content.size)).toBe('the one and the two, recieve');
  });

  it('DOCE-PROOFING-2.5 ignores one issue alone', async () => {
    const state = await checked(stateOf(paragraph(text('teh one and teh two'))));
    const [first] = listProofingIssues(state);
    if (!first) throw new Error('An issue is marked');
    const next = run(state, ignoreProofingOnce(first));
    expect(listProofingIssues(next).map((issue) => issue.from)).toEqual([
      listProofingIssues(state)[1]?.from,
    ]);
  });

  it('DOCE-PROOFING-2.6 turns a rule off, in the proofer too', async () => {
    const state = await checked(stateOf(paragraph(text('We saw a apple and a apple.'))));
    const [issue] = listProofingIssues(state);
    expect(issue?.rule?.id).toBe('a apple');
    if (!issue) throw new Error('An issue is marked');
    const next = run(state, disableProofingRule(issue));
    expect(listProofingIssues(next)).toEqual([]);
    const proofer = proofingKey.getState(next)?.proofers[0];
    const again = await proofer?.check([{ text: 'a apple' }], {
      signal: new AbortController().signal,
    });
    expect(again?.[0]).toEqual([]);
  });

  it('DOCE-PROOFING-2.7 checks the document again in another language', async () => {
    const state = await checked(stateOf(paragraph(text('teh text'))));
    expect(isProofingPending(state)).toBe(false);
    const french = run(state, setProofingLanguage('fr'));
    expect(proofingKey.getState(french)?.language).toBe('fr');
    expect(listProofingIssues(french)).toEqual([]);
    expect(isProofingPending(french)).toBe(true);
    expect(setProofingLanguage('fr')(french)).toBe(false);
    const again = run(french, recheckProofing);
    expect(isProofingPending(again)).toBe(true);
  });

  it('DOCE-PROOFING-1.5 cuts a long text into segments of whole words', () => {
    const segments = segmentsOf('One two. Three four five. Six', 12);
    expect(segments.map((segment) => segment.text)).toEqual([
      'One two. ',
      'Three four ',
      'five. Six',
    ]);
    expect(segments.map((segment) => segment.offset)).toEqual([0, 9, 20]);
    expect(segmentsOf('Short', 12)).toEqual([{ text: 'Short', offset: 0 }]);
  });

  it('DOCE-PROOFING-1.6 keeps whether the proofers answered', () => {
    const state = stateOf(paragraph(text('Some text')));
    const meta = { results: new Map(), status: 'degraded' };
    const next = state.apply(state.tr.setMeta(proofingKey, meta));
    expect(proofingKey.getState(next)?.status).toBe('degraded');
    expect(proofingKey.getState(run(next, recheckProofing))?.status).toBe('ready');
  });
});
