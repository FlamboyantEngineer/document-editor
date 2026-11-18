import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../../test/document-markup.js';
import { caretAt, footnoteState, note, paragraph, text } from '../../../test/footnote-fixtures.js';
import { DEFAULT_SHORTCUTS } from '../../engine/index.js';
import { readDocumentFile } from '../../model/index.js';
import { blockStyles } from './block-styles.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import { builtInToolbarGroups } from './toolbar-groups.js';
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
      documentMenu: { save: () => undefined },
    });
    const listed = Object.fromEntries(
      groups.map((group) => [group.id, group.items.map((item) => item.id)]),
    );
    expect(listed).toEqual(TOOLBAR_GROUPS);
  });
});

describe('built-in toolbar groups', () => {
  const groupsWith = (optional?: readonly ('link' | 'checklist')[]) =>
    builtInToolbarGroups(documentSchema, DEFAULT_EDITOR_LABELS, { templateStyle: {}, optional });
  const idsOf = (groups: ReturnType<typeof groupsWith>, id: string) =>
    groups.find((group) => group.id === id)?.items.map((item) => item.id);

  it('DOCE-EDITOR-4.3 names each group and sets off the marks, lists, references, layout and mode', () => {
    const groups = groupsWith();
    expect(groups.map((group) => group.label)).toEqual([
      'View',
      'History',
      'Text styling',
      'Text formatting',
      'Lists',
      'References',
      'Insert content',
      'Layout',
      'Editing mode',
    ]);
    expect(groups.filter((group) => group.divided).map((group) => group.id)).toEqual([
      'view',
      'marks',
      'lists',
      'references',
      'layout',
      'mode',
    ]);
  });

  it('DOCE-EDITOR-4.3 leaves the link and the checklist out unless the host names them', () => {
    expect(idsOf(groupsWith(), 'marks')).not.toContain('link');
    expect(idsOf(groupsWith(), 'lists')).toEqual(['bullet-list', 'numbered-list']);
    const all = groupsWith(['link', 'checklist']);
    expect(idsOf(all, 'marks')?.at(-1)).toBe('link');
    expect(idsOf(all, 'lists')?.at(-1)).toBe('checklist');
  });

  it('DOCE-EDITOR-4.3 says why a reference cannot go where the writer could otherwise edit', () => {
    const labels = { ...DEFAULT_EDITOR_LABELS, referencesUnavailable: 'Not here' };
    const reference = builtInToolbarGroups(documentSchema, labels, { templateStyle: {} })
      .find((group) => group.id === 'references')
      ?.items.find((item) => item.id === 'reference');
    if (reference?.kind !== 'menu') throw new Error('No reference menu.');
    const doc = parseMarkup('<h1>Title</h1>');
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    const context = createEditorContext(null, state, { editable: true, labels });
    expect(isItemEnabled(reference, context)).toBe(false);
    expect(disabledReasonOf(reference, context)).toBe('Not here');
  });

  it('DOCE-EDITOR-4.5 offers the kinds of figure from a menu, a diagram while the host draws them', () => {
    const figureOf = (diagrams: boolean) =>
      builtInToolbarGroups(documentSchema, DEFAULT_EDITOR_LABELS, {
        templateStyle: {},
        features: { linkedCode: false, symbols: DEFAULT_SYMBOLS, glossary: false, diagrams },
      })
        .find((group) => group.id === 'insert')
        ?.items.find((item) => item.id === 'figure');
    const doc = parseMarkup('<p>Text</p>');
    const context = createEditorContext(null, EditorState.create({ doc }), {
      editable: true,
      labels: DEFAULT_EDITOR_LABELS,
    });
    const entryIds = (diagrams: boolean) => {
      const figure = figureOf(diagrams);
      if (figure?.kind !== 'menu') throw new Error('No figure menu.');
      return figure.entries(context).map((entry) => entry.id);
    };
    expect(entryIds(false)).toEqual(['image-figure']);
    expect(entryIds(true)).toEqual(['image-figure', 'diagram-figure']);
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

  it('DOCE-EDITOR-4.14 says a block cannot go in a footnote, in its text', () => {
    const state = caretAt(
      footnoteState([paragraph(text('Body'), note('note-1', 'Note text'))]),
      'Note text',
      2,
    );
    const context = createEditorContext(null, state, {
      editable: true,
      labels: DEFAULT_EDITOR_LABELS,
    });
    const blocked = { ...item, isEnabled: () => false };
    expect(disabledReasonOf(blocked, context)).toBe(DEFAULT_EDITOR_LABELS.reasonFootnote);
    expect(disabledReasonOf(blocked, contextOf({ editable: true }))).toBeUndefined();
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
