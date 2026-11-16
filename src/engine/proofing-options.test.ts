import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  createWordListProofer,
  type ProoferAdapter,
  type ProofingIssue,
  type ProofingText,
} from '../host/index.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createAbbreviationHealth, recordGlossaryEntries } from './abbreviation-health.js';
import {
  createProofing,
  isProofingPending,
  type ProofingDecision,
  proofingKey,
  type ProofingOptions,
} from './proofing.js';
import {
  disableProofingRule,
  ignoreProofingIssue,
  listDocumentIssues,
  listProofingIssues,
  replaceProofingIssue,
  selectNextProofingIssue,
} from './proofing-commands.js';
import { isTechnicalToken } from './proofing-tokens.js';

const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

const docOf = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

// A proofer that answers each check with the issues `find` gives each text, and records the texts.
function recordingProofer(find: (text: string) => ProofingIssue[]) {
  const checks: (readonly ProofingText[])[] = [];
  const proofer: ProoferAdapter = {
    check: (texts) => {
      checks.push(texts);
      return Promise.resolve(texts.map(({ text: value }) => find(value)));
    },
  };
  return { proofer, checks };
}

// Issues for each listed word wherever it is in a text.
const wordsIn =
  (words: Record<string, Partial<ProofingIssue>>) =>
  (value: string): ProofingIssue[] =>
    Object.entries(words).flatMap(([word, issue]) => {
      const at = value.indexOf(word);
      return at < 0
        ? []
        : [{ from: at, to: at + word.length, kind: 'spelling', suggestions: [], ...issue }];
    });

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

function viewOf(
  doc: ReturnType<typeof docOf>,
  options: ProofingOptions,
  editable: () => boolean = () => true,
) {
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, plugins: [createProofing({ delay: 0, ...options })] }),
    editable,
  });
  views.push(view);
  return view;
}

const marked = (state: EditorState) => listProofingIssues(state).map((issue) => issue.text);

describe('proofing options', () => {
  it('DOCE-PROOFING-1.7 recognises acronyms, part numbers, standards and identifiers', () => {
    for (const token of [
      'USB',
      'APIs',
      'XB12C-Q7',
      '4K60',
      'ISO-8601',
      'ISO/IEC',
      'max_count',
      'innerHTML',
    ]) {
      expect(isTechnicalToken(token), token).toBe(true);
    }
    for (const word of ['recieve', 'Teh', 'Report', 'a error', '']) {
      expect(isTechnicalToken(word), word).toBe(false);
    }
  });

  it('DOCE-PROOFING-1.7 leaves technical tokens unmarked unless the host says otherwise', async () => {
    const doc = docOf(paragraph(text('The USB port uses XB12C-Q7 and teh MAC.')));
    const proofer = createWordListProofer({
      corrections: { usb: ['UBS'], xb12c: ['AM263'], teh: ['the'] },
      grammar: { 'the mac': { message: 'Name it.', suggestions: [] } },
    });
    const view = viewOf(doc, { proofer });
    await vi.waitFor(() => expect(marked(view.state)).toEqual(['teh']));
    // The dictionary still filters as before, and a host may mark every issue.
    const every = viewOf(doc, { proofer, skip: null });
    await vi.waitFor(() => expect(marked(every.state)).toEqual(['USB', 'XB12C', 'teh']));
  });

  it('DOCE-PROOFING-1.2 marks each issue with its category and rule', async () => {
    const { proofer } = recordingProofer(
      wordsIn({
        ',,': { kind: 'grammar', category: 'punctuation', rule: { id: 'DOUBLE_COMMA' } },
        teh: { kind: 'spelling' },
      }),
    );
    const view = viewOf(docOf(paragraph(text('Write teh notes,, then stop.'))), { proofer });
    await vi.waitFor(() => expect(marked(view.state)).toHaveLength(2));
    const marks = [...view.dom.querySelectorAll('[data-proofing-issue]')].map((element) => [
      element.textContent,
      element.getAttribute('data-proofing-category'),
      element.getAttribute('data-proofing-rule'),
    ]);
    expect(marks).toEqual([
      ['teh', 'spelling', null],
      [',,', 'punctuation', 'DOUBLE_COMMA'],
    ]);
  });

  it('DOCE-PROOFING-2.8 starts with the decisions the host kept and tells it new ones', async () => {
    const decisions: ProofingDecision[] = [];
    const { proofer } = recordingProofer(
      wordsIn({
        teh: {},
        recieve: {},
        seperate: { kind: 'grammar', rule: { id: 'SEP' } },
        alot: { kind: 'grammar', rule: { id: 'ALOT' } },
      }),
    );
    const view = viewOf(docOf(paragraph(text('teh recieve seperate alot'))), {
      proofer,
      ignored: ['teh'],
      disabledRules: ['SEP'],
      onDecision: (decision) => decisions.push(decision),
    });
    await vi.waitFor(() => expect(marked(view.state)).toEqual(['recieve', 'alot']));
    const [word, ruled] = listProofingIssues(view.state);
    if (!word || !ruled) throw new Error('Two issues are marked');
    ignoreProofingIssue(word)(view.state, view.dispatch);
    disableProofingRule(ruled)(view.state, view.dispatch);
    expect(marked(view.state)).toEqual([]);
    expect(decisions).toEqual([
      { kind: 'ignore', word: 'recieve' },
      { kind: 'disable-rule', rule: 'ALOT' },
    ]);
    // The document's content holds none of them.
    expect(JSON.stringify(view.state.doc.toJSON())).not.toContain('proofing');
  });

  it('DOCE-PROOFING-1.8 proofs nothing while the editor is not editable or the host turns it off', async () => {
    const { proofer, checks } = recordingProofer(wordsIn({ teh: {} }));
    let editable = false;
    const view = viewOf(docOf(paragraph(text('A teh report.'))), { proofer }, () => editable);
    await vi.waitFor(() => expect(proofingKey.getState(view.state)?.enabled).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checks).toHaveLength(0);
    expect(isProofingPending(view.state)).toBe(false);
    editable = true;
    view.setProps({});
    await vi.waitFor(() => expect(marked(view.state)).toEqual(['teh']));
    expect(view.dom.querySelector('[data-proofing-issue]')).not.toBeNull();
    // Turned off again, as for a historical view, nothing is marked or listed.
    editable = false;
    view.setProps({});
    await vi.waitFor(() => expect(proofingKey.getState(view.state)?.enabled).toBe(false));
    expect(listProofingIssues(view.state)).toEqual([]);
    expect(view.dom.querySelector('[data-proofing-issue]')).toBeNull();
  });

  it('DOCE-PROOFING-1.8 aborts the running check when the host turns proofing off', async () => {
    let on = true;
    const signals: AbortSignal[] = [];
    const proofer: ProoferAdapter = {
      check: (texts, { signal }) => {
        signals.push(signal);
        return new Promise((resolve) =>
          setTimeout(() => resolve(texts.map(() => wordsIn({ teh: {} })('teh'))), 300),
        );
      },
    };
    const view = viewOf(docOf(paragraph(text('teh'))), { proofer, isEnabled: () => on });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    on = false;
    view.setProps({});
    expect(signals[0]?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(proofingKey.getState(view.state)?.results.size).toBe(0);
  });

  it('DOCE-PROOFING-1.9 waits for the host to start the first check, and cancels it on destroy', async () => {
    const { proofer, checks } = recordingProofer(wordsIn({ teh: {} }));
    let start: (() => void) | null = null;
    const cancel = vi.fn();
    const view = viewOf(docOf(paragraph(text('A teh report.'))), {
      proofer,
      scheduleFirstCheck: (run) => {
        start = run;
        return cancel;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checks).toHaveLength(0);
    (start as (() => void) | null)?.();
    await vi.waitFor(() => expect(marked(view.state)).toEqual(['teh']));
    view.destroy();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('DOCE-PROOFING-1.2 DOCE-PROOFING-1.6 checks nothing in a blank document and stays usable when a proofer fails', async () => {
    const { proofer, checks } = recordingProofer(() => []);
    viewOf(docOf(paragraph(text('   '))), { proofer });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checks).toHaveLength(0);
    // A proofer answering something other than lists marks nothing and reports it unavailable.
    const broken: ProoferAdapter = { check: () => Promise.resolve({} as never) };
    const view = viewOf(docOf(paragraph(text('A teh report.'))), { proofer: broken });
    await vi.waitFor(() => expect(proofingKey.getState(view.state)?.status).toBe('unavailable'));
    // A proofer saying why it did not answer, such as a timeout, is heard.
    const late: ProoferAdapter = {
      check: () => Promise.reject(Object.assign(new Error('Too slow.'), { reason: 'timeout' })),
    };
    const timed = viewOf(docOf(paragraph(text('A teh report.'))), { proofer: late });
    await vi.waitFor(() => expect(proofingKey.getState(timed.state)?.reason).toBe('timeout'));
    view.dispatch(view.state.tr.insertText('!', view.state.selection.from));
    expect(view.dom).toHaveTextContent('!');
  });

  it('DOCE-PROOFING-1.5 checks hundreds of blocks in bounded batches', async () => {
    const { proofer, checks } = recordingProofer(() => []);
    const blocks = Array.from({ length: 120 }, (_, index) =>
      paragraph(text(`Line ${String(index)}`)),
    );
    viewOf(docOf(...blocks), { proofer });
    await vi.waitFor(() => expect(checks.flat()).toHaveLength(120));
    expect(checks.map((texts) => texts.length)).toEqual([50, 50, 20]);
  });

  it('DOCE-PROOFING-1.2 drops the late answer of a check the document outran', async () => {
    const answers: ((issues: ProofingIssue[][]) => void)[] = [];
    const proofer: ProoferAdapter = {
      check: (texts) =>
        new Promise((resolve) => {
          answers.push(resolve);
          void texts;
        }),
    };
    const view = viewOf(docOf(paragraph(text('teh'))), { proofer });
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    view.dispatch(view.state.tr.insertText('x', 1));
    answers[0]?.([[{ from: 0, to: 3, kind: 'spelling', suggestions: [] }]]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(proofingKey.getState(view.state)?.results.has('teh')).toBe(false);
  });

  it('DOCE-PROOFING-1.1 checks list items, table cells and link text, and leaves out atoms', async () => {
    const { proofer, checks } = recordingProofer(wordsIn({ teh: {} }));
    const cell = (value: string): StoredNode => ({
      type: 'tableCell',
      content: [paragraph(text(value))],
    });
    const view = viewOf(
      docOf(
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph(text('teh item'))] }],
        },
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [cell('teh cell'), cell('fine')] }],
        },
        paragraph(
          text('teh link', [{ type: 'link', attrs: { href: 'https://example.test' } }]),
          text(' then '),
          { type: 'math', attrs: { source: 'teh' } },
          { type: 'variable', attrs: { key: 'teh' } },
        ),
      ),
      { proofer },
    );
    await vi.waitFor(() => expect(marked(view.state)).toEqual(['teh', 'teh', 'teh']));
    const [inList, inCell, inLink] = listProofingIssues(view.state);
    const within = (pos: number | undefined, type: string) => {
      const $pos = view.state.doc.resolve(pos ?? 0);
      return Array.from(
        { length: $pos.depth + 1 },
        (_, depth) => $pos.node(depth).type.name,
      ).includes(type);
    };
    expect(within(inList?.from, 'list_item')).toBe(true);
    expect(within(inCell?.from, 'table_cell')).toBe(true);
    expect(
      view.state.doc
        .resolve((inLink?.from ?? 0) + 1)
        .marks()
        .map((mark) => mark.type.name),
    ).toContain('link');
    // The math and the variable read as spaces: their text is never sent.
    expect(checks.flat().some(({ text: value }) => /then\s+teh/.test(value))).toBe(false);
  });
});

describe('the next issue', () => {
  // Two issues over the same text and one after, as one proofer finds them.
  const overlapping = (value: string): ProofingIssue[] => {
    const at = value.indexOf('teh');
    const later = value.indexOf('recieve');
    if (at < 0) return [];
    return [
      { from: at, to: at + 3, kind: 'spelling', suggestions: ['the'] },
      { from: at, to: at + 3, kind: 'grammar', suggestions: [], rule: { id: 'ARTICLE' } },
      ...(later < 0
        ? []
        : [{ from: later, to: later + 7, kind: 'spelling' as const, suggestions: [] }]),
    ];
  };

  const next = (view: EditorView) => {
    selectNextProofingIssue(view.state, view.dispatch);
    return view.state.doc.textBetween(view.state.selection.from, view.state.selection.to);
  };

  it('DOCE-PROOFING-2.3 visits issues over the same text one by one and goes on from the last visited', async () => {
    const { proofer } = recordingProofer(overlapping);
    const view = viewOf(docOf(paragraph(text('A teh and a recieve.')), paragraph(text('End.'))), {
      proofer,
    });
    await vi.waitFor(() => expect(listProofingIssues(view.state)).toHaveLength(3));
    const kinds: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      next(view);
      kinds.push(
        listDocumentIssues(view.state).find(
          (issue) => issue.key === proofingKey.getState(view.state)?.visited?.key,
        )?.kind ?? '',
      );
    }
    // Issues over the same text go in a fixed order: by their keys, the rule's id or the kind.
    expect(kinds).toEqual(['grammar', 'spelling', 'spelling']);
    // The caret moves away; the next issue still follows the last visited, wrapping round.
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
    expect(next(view)).toBe('teh');
    expect(proofingKey.getState(view.state)?.visited?.from).toBe(view.state.selection.from);
  });

  it('DOCE-PROOFING-2.3 goes on after an issue visited last that is gone', async () => {
    const { proofer } = recordingProofer(wordsIn({ teh: { suggestions: ['the'] }, recieve: {} }));
    const view = viewOf(docOf(paragraph(text('teh, then recieve.'))), { proofer });
    await vi.waitFor(() => expect(listProofingIssues(view.state)).toHaveLength(2));
    expect(next(view)).toBe('teh');
    const [first] = listProofingIssues(view.state);
    if (!first) throw new Error('An issue is marked');
    replaceProofingIssue(first, 'the')(view.state, view.dispatch);
    expect(next(view)).toBe('recieve');
  });

  it('DOCE-REFERENCES-2.3 counts and visits abbreviations whose entry needs the writer', async () => {
    const { proofer } = recordingProofer(wordsIn({ teh: {} }));
    const doc = docOf(
      paragraph(
        {
          type: 'abbreviation',
          attrs: { entry: 'g1', abbreviation: 'GSE', expansion: 'Ground equipment' },
        },
        text(' and teh end.'),
      ),
    );
    const glossary = { resolve: () => Promise.resolve({ ok: true as const, value: [] }) };
    const view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({
        doc,
        plugins: [
          createProofing({ proofer, delay: 0 }),
          createAbbreviationHealth({ glossary, delay: 0 }),
        ],
      }),
    });
    views.push(view);
    await vi.waitFor(() => expect(marked(view.state)).toEqual(['teh']));
    recordGlossaryEntries(['g1'], [])(view.state, view.dispatch);
    const issues = listDocumentIssues(view.state);
    expect(issues.map((issue) => issue.category ?? issue.kind)).toEqual([
      'abbreviation-missing',
      'spelling',
    ]);
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
    selectNextProofingIssue(view.state, view.dispatch);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(next(view)).toBe('teh');
  });
});
