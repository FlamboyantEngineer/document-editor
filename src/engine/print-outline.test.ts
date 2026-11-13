import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { footnoteState, paragraph, text } from '../../test/footnote-fixtures.js';
import { BASE_TEMPLATE, type StoredNode } from '../model/index.js';
import { snapshotOutline } from './print-outline.js';

const heading = (id: string | null, level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: id ? { id, level } : { level },
  content: [text(value)],
});

describe('snapshotOutline', () => {
  it('DOCE-EDITOR-6.24 lists the headings with their element ids, numbers, levels and pages', () => {
    const state = footnoteState([
      heading('h-scope', 1, 'Scope'),
      paragraph(text('Body.')),
      heading('h-terms', 2, 'Terms'),
    ]);
    const view = new EditorView(document.createElement('div'), { state });
    expect(snapshotOutline(view, BASE_TEMPLATE)).toEqual([
      { elementId: 'h-scope', level: 1, text: 'Scope', number: '1.', page: 0, top: 0 },
      { elementId: 'h-terms', level: 2, text: 'Terms', number: '1.1.', page: 0, top: 0 },
    ]);
    view.destroy();
  });
});
