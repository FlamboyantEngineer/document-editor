import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import { builtInToolbarGroups } from './toolbar-controls.js';
import { TOOLBAR_GROUPS } from './toolbar-items.js';

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
    });
    const listed = Object.fromEntries(
      groups.map((group) => [group.id, group.items.map((item) => item.id)]),
    );
    expect(listed).toEqual(TOOLBAR_GROUPS);
  });
});
