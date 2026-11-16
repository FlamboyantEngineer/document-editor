import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { DEFAULT_SHORTCUTS } from '../../engine/index.js';
import { readDocumentFile } from '../../model/index.js';
import { blockStyles } from './block-styles.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import { builtInToolbarGroups } from './toolbar-controls.js';
import {
  disabledReasonOf,
  isItemEnabled,
  TOOLBAR_GROUPS,
  type ToolbarButtonItem,
} from './toolbar-items.js';

describe('TOOLBAR_GROUPS', () => {
  it("DOCE-EDITOR-4.3 lists the ids of every item in the editor's own groups, in order", () => {
    const groups = builtInToolbarGroups(documentSchema, DEFAULT_EDITOR_LABELS, {
      templateStyle: {},
      features: {
        linkedCode: true,
        symbols: DEFAULT_SYMBOLS,
        glossary: true,
        references: true,
        scripts: true,
      },
      shell: { onModeChange: () => undefined, onMarkupChange: () => undefined },
    });
    const listed = Object.fromEntries(
      groups.map((group) => [group.id, group.items.map((item) => item.id)]),
    );
    expect(listed).toEqual(TOOLBAR_GROUPS);
  });
});

describe('disabled reasons', () => {
  const contextOf = (options: { editable: boolean }) =>
    createEditorContext(null, EditorState.create({ schema: documentSchema }), {
      ...options,
      labels: DEFAULT_EDITOR_LABELS,
    });
  const item: ToolbarButtonItem = {
    kind: 'button',
    id: 'host',
    label: 'Host',
    run: () => undefined,
  };

  it('DOCE-EDITOR-4.14 says why an item is disabled, its own reason first', () => {
    expect(disabledReasonOf(item, contextOf({ editable: true }))).toBeUndefined();
    expect(disabledReasonOf(item, contextOf({ editable: false }))).toBe(
      'The document is open for reading',
    );
    const own = { ...item, isEnabled: () => false, disabledReason: () => 'Not yet' };
    expect(isItemEnabled(own, contextOf({ editable: true }))).toBe(false);
    expect(disabledReasonOf(own, contextOf({ editable: true }))).toBe('Not yet');
  });
});

describe('text styles', () => {
  it('DOCE-EDITOR-4.1 offers the Title style, a top-level heading marked as the document title', () => {
    const styles = blockStyles(documentSchema, DEFAULT_EDITOR_LABELS, {
      shortcuts: DEFAULT_SHORTCUTS,
      customStyles: [],
    });
    expect(styles.map((style) => style.id).slice(0, 3)).toEqual([
      'paragraph',
      'title',
      'heading-1',
    ]);
    const title = styles.find((style) => style.id === 'title');
    let state = EditorState.create({
      doc: readDocumentFile(
        {
          formatVersion: 1,
          sections: [
            { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Report' }] }] },
          ],
        },
        documentSchema,
      ).doc,
    });
    state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
    title?.command(state, (tr) => (state = state.apply(tr)));
    let heading: { level: unknown; docTitle: unknown } | null = null;
    state.doc.descendants((node) => {
      if (node.type.name === 'heading')
        heading = { level: node.attrs.level, docTitle: node.attrs.docTitle };
    });
    expect(heading).toEqual({ level: 1, docTitle: true });
  });
});
