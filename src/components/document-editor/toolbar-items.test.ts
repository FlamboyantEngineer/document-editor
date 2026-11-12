import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
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
