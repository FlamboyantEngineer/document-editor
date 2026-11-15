import { readFileSync } from 'node:fs';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema, writeMarkup } from '../../test/document-markup.js';
import { createDocumentEditing } from '../engine/document-editing.js';
import { updateEmbed } from '../engine/embed-status.js';
import { insertEmbed, listEmbeds } from '../engine/embeds.js';
import { readDocumentFile, writeDocumentFile } from '../model/index.js';
import { MAX_SPAN } from '../model/schema/table-nodes.js';
import {
  createLinkedSpreadsheetAdapter,
  createLinkedSpreadsheetEmbed,
  type LinkedSpreadsheetCapture,
  readLinkedSpreadsheetSource,
} from './linked-spreadsheet.js';

const capture = (): LinkedSpreadsheetCapture =>
  JSON.parse(
    readFileSync('test/fixtures/documents/contracts/linked-spreadsheet-capture.json', 'utf8'),
  ) as LinkedSpreadsheetCapture;

describe('linked spreadsheet bridge', () => {
  it('DOCE-EMBEDS-1.3 inserts and persists a locked captured table without evaluating formulas', () => {
    const captured = capture();
    const embed = createLinkedSpreadsheetEmbed(captured, 'Summary');
    const first = captured.table.rows[0]?.[0];
    if (first) first.text = 'Changed after capture';
    expect(readLinkedSpreadsheetSource(embed)).toEqual({
      id: 'book-1',
      sheetId: 'sheet-1',
      range: 'A1:B2',
    });
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }],
          },
        ],
      },
      documentSchema,
    ).doc;
    let state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, 6)));
    expect(
      insertEmbed(embed)(state, (tr) => {
        state = state.apply(tr);
      }),
    ).toBe(true);
    const found = listEmbeds(state.doc)[0];
    if (!found) throw new Error('No embed.');
    let textAt = 0;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text === '42') textAt = pos;
    });
    const unchanged = state.applyTransaction(state.tr.insertText('99', textAt, textAt + 2));
    expect(unchanged.transactions).toHaveLength(0);
    const stored = writeDocumentFile(state.doc);
    const restored = readDocumentFile(stored, documentSchema).doc;
    expect(listEmbeds(restored)[0]?.node.attrs).toMatchObject({
      kind: 'spreadsheet',
      snapshot: 'revision-1',
    });
    expect(writeMarkup(restored)).toContain('42');
    expect(listEmbeds(restored)[0]?.node.textContent).toBe('42NoteCaptured');
  });

  it('DOCE-EMBEDS-1.3 adapts authoritative captures and rejects mismatched selection or stale results', async () => {
    const embed = createLinkedSpreadsheetEmbed(capture());
    const adapter = createLinkedSpreadsheetAdapter(() =>
      Promise.resolve({ ok: true, value: capture() }),
    );
    await expect(adapter.resolve([embed])).resolves.toMatchObject({
      value: [{ snapshot: 'revision-1' }],
    });
    await expect(adapter.load(embed)).resolves.toMatchObject({ value: { content: embed.content } });
    const invalid = capture();
    invalid.publication.revision = -1;
    expect(() => createLinkedSpreadsheetEmbed(invalid)).toThrow('ready capture');
    const mixed = capture();
    mixed.publication.cellStates = { cell: 'pending' };
    expect(() => createLinkedSpreadsheetEmbed(mixed)).toThrow('ready capture');
    const stale = capture();
    stale.publication.status = 'pending';
    expect(() => createLinkedSpreadsheetEmbed(stale)).toThrow('ready capture');
    const unavailable = createLinkedSpreadsheetAdapter(() =>
      Promise.resolve({ ok: true, value: stale }),
    );
    await expect(unavailable.load(embed)).resolves.toMatchObject({
      error: { kind: 'unavailable' },
    });
    const different = capture();
    different.source.id = 'other';
    const conflicting = createLinkedSpreadsheetAdapter(() =>
      Promise.resolve({ ok: true, value: different }),
    );
    await expect(conflicting.load(embed)).resolves.toMatchObject({ error: { kind: 'conflict' } });
    expect(readLinkedSpreadsheetSource({ kind: 'spreadsheet', source: 'bad' })).toBeNull();
    expect(readLinkedSpreadsheetSource({ kind: 'other', source: embed.source })).toBeNull();
    const denied = createLinkedSpreadsheetAdapter(() =>
      Promise.resolve({ ok: false, error: { kind: 'denied' } }),
    );
    await expect(denied.resolve([embed])).resolves.toEqual({ ok: true, value: ['no-access'] });
  });
  it('DOCE-EMBEDS-1.3 refreshes explicitly and refuses historical views before and after loading', async () => {
    const embed = createLinkedSpreadsheetEmbed(capture());
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'embed',
                attrs: {
                  kind: embed.kind,
                  source: embed.source,
                  snapshot: embed.snapshot,
                  label: embed.label,
                  id: 'e0000001',
                },
                content: embed.content,
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
    const view = new EditorView(document.createElement('div'), { state, editable: () => false });
    const changed = capture();
    changed.source.revision = 'revision-2';
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: changed }));
    const adapter = createLinkedSpreadsheetAdapter(load);
    const pos = listEmbeds(state.doc)[0]?.pos;
    if (pos === undefined) throw new Error('No embed.');
    try {
      expect(await updateEmbed(view, adapter, { pos })).toBe(false);
      expect(load).not.toHaveBeenCalled();
      view.setProps({ editable: () => true });
      const pending = updateEmbed(view, adapter, { pos });
      view.setProps({ editable: () => false });
      expect(await pending).toBe(false);
      expect(listEmbeds(view.state.doc)[0]?.node.attrs.snapshot).toBe('revision-1');
      view.setProps({ editable: () => true });
      expect(await updateEmbed(view, adapter, { pos })).toBe(true);
      expect(listEmbeds(view.state.doc)[0]?.node.attrs.snapshot).toBe('revision-2');
    } finally {
      view.destroy();
    }
  });
  it('DOCE-EMBEDS-1.3 validates transport row spans and escapes cell text through stored nodes', () => {
    for (const rows of [
      [[{ text: 'a', colspan: 0, rowspan: 1 }]],
      [[{ text: 'a', colspan: 1, rowspan: 3 }]],
      [[{ text: 'a', colspan: 2, rowspan: 1 }], [{ text: 'b', colspan: 1, rowspan: 1 }]],
      [
        [
          { text: 'a', colspan: 1, rowspan: 1 },
          { text: 'b', colspan: 1, rowspan: 2 },
        ],
        [{ text: 'c', colspan: 2, rowspan: 1 }],
      ],
    ]) {
      const invalid = capture();
      invalid.table.rows = rows;
      expect(() => createLinkedSpreadsheetEmbed(invalid)).toThrow();
    }
    const captured = capture();
    captured.table.rows = [[{ text: '<script>text</script>', colspan: 2, rowspan: 2 }], []];
    const embed = createLinkedSpreadsheetEmbed(captured);
    expect(embed.content[0]?.content).toHaveLength(1);
    expect(embed.content[0]?.content?.[0]?.content?.[0]?.attrs).toEqual({ colspan: 2 });
    const restored = readDocumentFile(
      { formatVersion: 1, sections: [{ name: null, content: embed.content }] },
      documentSchema,
    ).doc;
    expect(writeMarkup(restored)).toContain('&lt;script&gt;text&lt;/script&gt;');
    expect(restored.textBetween(0, restored.content.size)).toBe('<script>text</script>');
  });
  it('DOCE-EMBEDS-1.3 respects the document schema span limit before emitting stored content', () => {
    const widest = capture();
    widest.table.rows = [[{ text: 'Boundary', colspan: MAX_SPAN, rowspan: 1 }]];
    const accepted = createLinkedSpreadsheetEmbed(widest);
    expect(() =>
      readDocumentFile(
        { formatVersion: 1, sections: [{ name: null, content: accepted.content }] },
        documentSchema,
      ),
    ).not.toThrow();
    widest.table.rows = [[{ text: 'Too wide', colspan: MAX_SPAN + 1, rowspan: 1 }]];
    expect(() => createLinkedSpreadsheetEmbed(widest)).toThrow(
      `must be a whole number from 1 to ${MAX_SPAN}`,
    );
    const tallest = capture();
    tallest.table.rows = [
      [{ text: 'Too tall', colspan: 1, rowspan: MAX_SPAN + 1 }],
      ...Array.from({ length: MAX_SPAN }, () => []),
    ];
    expect(() => createLinkedSpreadsheetEmbed(tallest)).toThrow(
      `must be a whole number from 1 to ${MAX_SPAN}`,
    );
  });
  it('DOCE-EMBEDS-1.3 retains capture-specific width and area bounds before construction', () => {
    const wide = capture();
    wide.table.rows = [
      Array.from({ length: 16_385 }, () => ({ text: 'x', colspan: 1, rowspan: 1 })),
    ];
    expect(() => createLinkedSpreadsheetEmbed(wide)).toThrow('Linked spreadsheet row is too large');
    const large = capture();
    large.table.rows = Array.from({ length: 501 }, () =>
      Array.from({ length: 100 }, () => ({ text: 'x', colspan: 1, rowspan: 1 })),
    );
    expect(() => createLinkedSpreadsheetEmbed(large)).toThrow(
      'Linked spreadsheet row is too large',
    );
  });
});
