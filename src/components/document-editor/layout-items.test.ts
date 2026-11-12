import { EditorState, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../../test/document-markup.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { layoutEntries, layoutItem } from './layout-items.js';

let view: EditorView | null = null;
afterEach(() => view?.destroy());

function contextFor(html: string) {
  const doc = parseMarkup(html);
  const state = EditorState.create({ doc, selection: Selection.atStart(doc) });
  view = new EditorView(document.createElement('div'), { state });
  const current = view;
  return () =>
    createEditorContext(current, current.state, { editable: true, labels: DEFAULT_EDITOR_LABELS });
}

type Entry = { id: unknown; isSelected?: boolean; isDisabled?: boolean; onAction?: () => void };
const entry = (entries: readonly unknown[], id: string) => {
  const found = (entries as Entry[]).find((each) => each.id === id);
  if (!found) throw new Error(`No ${id} entry.`);
  return found;
};

describe('the layout menu', () => {
  it('DOCE-EDITOR-4.13 inserts a layout section of a preset, then offers its actions', () => {
    const context = contextFor('<p></p>');
    let entries = layoutEntries(context());
    expect(entry(entries, 'layout-section-remove').isDisabled).toBe(true);
    entry(entries, 'layout-thirds').onAction?.();
    const section = view?.state.doc.firstChild;
    expect(section?.type.name).toBe('layout_section');
    expect(section?.attrs.preset).toBe('thirds');
    entries = layoutEntries(context());
    expect(entry(entries, 'layout-thirds').isSelected).toBe(true);
    expect(entry(entries, 'layout-section-remove').isDisabled).toBe(false);
    entry(entries, 'layout-halves').onAction?.();
    expect(view?.state.doc.firstChild?.attrs.preset).toBe('halves');
    // Removing the only block leaves an empty one-column section in its place.
    entry(layoutEntries(context()), 'layout-section-remove').onAction?.();
    expect(view?.state.doc.firstChild?.attrs.preset).toBe('single');
  });

  it('DOCE-EDITOR-4.13 shows the menu while the schema has layout sections', () => {
    const item = layoutItem(DEFAULT_EDITOR_LABELS);
    expect(item.isVisible?.(contextFor('<p></p>')())).toBe(
      Boolean(documentSchema.nodes.layout_section),
    );
  });
});
