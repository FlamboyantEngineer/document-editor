import { EditorState } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { documentMenuItem } from './document-menu.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import type { DocumentExports } from './use-document-exports.js';

const context = createEditorContext(null, EditorState.create({ schema: documentSchema }), {
  editable: true,
  labels: DEFAULT_EDITOR_LABELS,
});

const exports = (run: DocumentExports['run']): DocumentExports => ({
  entries: [{ id: 'pdf', label: 'PDF', isRunning: false }],
  run,
});

describe('document menu', () => {
  it('DOCE-EDITOR-4.30 offers the host exports, each led by its icon, and runs one', () => {
    const run = vi.fn();
    const item = documentMenuItem(DEFAULT_EDITOR_LABELS, { exports: exports(run) });
    expect(item.isVisible?.(context)).toBe(true);
    const entries = item.entries(context);
    expect(entries.map((entry) => ('label' in entry ? entry.label : null))).toEqual([
      'Export to PDF',
    ]);
    const [entry] = entries;
    expect(entry && 'icon' in entry && entry.icon).toBeTruthy();
    if (entry && 'onAction' in entry) entry.onAction?.();
    expect(run).toHaveBeenCalledWith('pdf', DEFAULT_EDITOR_LABELS);
  });

  it('DOCE-EDITOR-4.30 does not show without scripts, a template or exports', () => {
    const item = documentMenuItem(DEFAULT_EDITOR_LABELS, {});
    expect(item.isVisible?.(context)).toBe(false);
  });

  it('DOCE-EDITOR-4.30 takes its words from the labels', () => {
    const labels = {
      ...DEFAULT_EDITOR_LABELS,
      documentMenu: 'Actions',
      exportTo: (l: string) => `${l} file`,
    };
    const item = documentMenuItem(labels, { exports: exports(() => undefined) });
    expect(item.label).toBe('Actions');
    const [entry] = item.entries({ ...context, labels });
    expect(entry && 'label' in entry && entry.label).toBe('PDF file');
  });
});
