import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createProofing, listProofingIssues } from '../../engine/index.js';
import { createWordListProofer } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { contextGroups } from './context-entries.js';
import { resolveContextTarget } from './context-target.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { proofingEntries } from './proofing-entries.js';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

const paragraphOf = (value: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

async function proofedView(value: string, inTable = false) {
  const cell = (cellText: string) => ({ type: 'tableCell', content: [paragraphOf(cellText)] });
  const block = inTable
    ? { type: 'table', content: [{ type: 'tableRow', content: [cell(value), cell('Fine')] }] }
    : paragraphOf(value);
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [block] }] },
    documentSchema,
  ).doc;
  const proofer = createWordListProofer({
    corrections: { teh: ['the', 'ten'] },
    grammar: { 'a error': { message: 'Use an.', suggestions: [] } },
  });
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [createProofing({ proofer, delay: 0 })] }),
  });
  views.push(view);
  await vi.waitFor(() => expect(listProofingIssues(view.state).length).toBeGreaterThan(0));
  return view;
}

// Each entry by its label, with whether it is disabled, and its own entries.
function shape(entries: readonly MenuEntry[]): unknown[] {
  return entries.map((entry) => {
    if (entry.type === 'separator') return '---';
    if (entry.type === 'section') return { section: entry.title, items: shape(entry.items) };
    const label = entry.isDisabled ? `${entry.label} (disabled)` : entry.label;
    return entry.items ? { [label]: shape(entry.items) } : label;
  });
}

const options = { labels: DEFAULT_EDITOR_LABELS, editable: true };

describe('proofing entries', () => {
  it('DOCE-PROOFING-3.2 holds an issue entries in a Spelling submenu, disabling what does not apply', async () => {
    const view = await proofedView('A teh report and a error.');
    const [spelling, grammar] = listProofingIssues(view.state);
    expect(
      shape(
        proofingEntries(view, { proofingIssue: spelling ?? null, proofingMark: true }, options),
      ),
    ).toEqual([
      {
        Spelling: [
          { section: 'Spelling', items: ['the', 'ten'] },
          'Replace all (disabled)',
          'Ignore',
          'Ignore all',
          'Add to dictionary',
          'Turn off this rule (disabled)',
        ],
      },
    ]);
    // A grammar issue may go to the dictionary too, and its rule may be turned off.
    expect(
      shape(proofingEntries(view, { proofingIssue: grammar ?? null, proofingMark: true }, options)),
    ).toEqual([
      {
        Spelling: [
          { section: 'Use an.', items: ['No suggestions (disabled)'] },
          'Replace all (disabled)',
          'Ignore',
          'Ignore all',
          'Add to dictionary',
          'Turn off this rule',
        ],
      },
    ]);
  });

  it('DOCE-PROOFING-3.2 shows nothing off a mark, and a mark the issues no longer hold with nothing to do', async () => {
    const view = await proofedView('A teh report.');
    const [issue] = listProofingIssues(view.state);
    expect(proofingEntries(view, { proofingIssue: null, proofingMark: false }, options)).toEqual(
      [],
    );
    expect(
      proofingEntries(
        view,
        { proofingIssue: issue ?? null, proofingMark: true },
        { ...options, editable: false },
      ),
    ).toEqual([]);
    expect(
      shape(proofingEntries(view, { proofingIssue: null, proofingMark: true }, options)),
    ).toEqual([
      {
        Spelling: [
          { section: 'Spelling', items: ['No suggestions (disabled)'] },
          'Replace all (disabled)',
          'Ignore (disabled)',
          'Ignore all (disabled)',
          'Add to dictionary (disabled)',
          'Turn off this rule (disabled)',
        ],
      },
    ]);
  });

  it('DOCE-PROOFING-3.2 takes the host labels', async () => {
    const view = await proofedView('A teh report.');
    const [issue] = listProofingIssues(view.state);
    const labels = { ...DEFAULT_EDITOR_LABELS, proofingMenu: 'Writing', ignoreIssue: 'Skip' };
    const [menu] = proofingEntries(
      view,
      { proofingIssue: issue ?? null, proofingMark: true },
      { labels, editable: true },
    );
    expect(menu?.type !== 'section' && menu?.type !== 'separator' && menu?.label).toBe('Writing');
    expect(JSON.stringify(shape([menu as MenuEntry]))).toContain('Skip');
  });

  it('DOCE-PROOFING-3.2 leads a table cell menu with the Spelling submenu, keeping the table actions', async () => {
    const view = await proofedView('A teh cell', true);
    const [issue] = listProofingIssues(view.state);
    const target = resolveContextTarget(view.state, (issue?.from ?? 0) + 1, true);
    const groups = contextGroups(view, target, {
      labels: DEFAULT_EDITOR_LABELS,
      editable: true,
      suggestionPolicy: { me: null, canDecide: true, canWithdraw: true },
      startComment: null,
    }).filter((group) => group.entries.length > 0);
    expect(target.kind).toBe('table-cell');
    expect(groups[0]?.id).toBe('proofing');
    expect(groups.map((group) => group.id)).toContain('table');
  });
});
