import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE, readDocumentFile, type TemplateFile } from '../model/index.js';
import {
  createCustomStyles,
  customStyleAt,
  customStyleNames,
  customStylesKey,
  setCustomStyle,
} from './custom-styles.js';

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: { ...BASE_TEMPLATE.styles, custom: { note: { size: '9pt', italic: true } } },
};

function stateAt(value: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
            { type: 'paragraph', content: [{ type: 'text', text: value }] },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let pos = -1;
  doc.descendants((node, at) => {
    if (node.isText && node.text === value) pos = at;
  });
  const state = EditorState.create({
    doc,
    plugins: [createCustomStyles({ template: () => TEMPLATE })],
  });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

describe('custom styles', () => {
  it('DOCE-TEMPLATES-7.1 applies a custom style to a block and gives it the style values', () => {
    expect(customStyleNames(TEMPLATE)).toEqual(['note']);
    let state = run(stateAt('Aside'), setCustomStyle('note'));
    expect(customStyleAt(state)).toBe('note');
    const decorations = customStylesKey.getState(state)?.find() ?? [];
    expect(decorations).toHaveLength(1);
    const attrs = (decorations[0] as unknown as { type: { attrs: Record<string, string> } }).type
      .attrs;
    expect(attrs['data-custom-style']).toBe('note');
    expect(attrs.style).toContain('--doc-custom-font-size: 9pt');
    expect(attrs.style).toContain('--doc-custom-font-style: italic');
    expect(setCustomStyle('note')(state)).toBe(false);
    state = run(state, setCustomStyle(null));
    expect(customStyleAt(state)).toBeNull();
    expect(customStylesKey.getState(state)?.find()).toHaveLength(0);
  });
});
