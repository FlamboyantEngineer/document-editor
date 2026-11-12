import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { createContents } from './contents.js';

const heading = (level: number, text: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    contents: {
      leader: { character: '.' },
      kinds: { toc: { title: 'Outline', levels: [null, { leader: { character: '-' } }] } },
    },
  },
};

let editor: EditorView | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function render(template: TemplateFile) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { content: [{ type: 'contents' }, heading(1, 'Scope'), heading(2, 'Scope details')] },
      ],
    },
    documentSchema,
  );
  const state = EditorState.create({
    doc,
    plugins: [createContents({ template: () => template })],
  });
  editor = new EditorView(document.createElement('div'), { state });
  return editor.dom;
}

describe('lists of contents under a template', () => {
  it('DOCE-TEMPLATES-10.4 shows the template title and each level its leader', () => {
    const view = render(TEMPLATE);
    expect(view.querySelector('.de-contents__title')?.textContent).toBe('Outline');
    const leaders = [...view.querySelectorAll('.de-contents__leader')].map((leader) =>
      leader.textContent?.charAt(0),
    );
    expect(leaders).toEqual(['.', '-']);
  });

  it('DOCE-TEMPLATES-10.4 keeps the editor title and draws no leader for an empty character', () => {
    const view = render({
      ...TEMPLATE,
      styles: { ...TEMPLATE.styles, contents: { leader: { character: '' } } },
    });
    expect(view.querySelector('.de-contents__title')?.textContent).toBe('Table of Contents');
    expect(view.querySelectorAll('.de-contents__entry')).toHaveLength(2);
    expect(view.querySelector('.de-contents__leader')).toBeNull();
  });
});
