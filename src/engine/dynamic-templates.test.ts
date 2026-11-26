import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  createDynamicTemplates,
  refreshDynamicTemplates,
  renderTemplateBlock,
  templateBlockKeys,
} from './index.js';

const block = (source: string, keys?: string): StoredNode => ({
  type: 'templateBlock',
  attrs: { source, ...(keys === undefined ? {} : { keys }) },
});

// A document storing the given texts for its variables (DOCE-FORMAT-1.7).
function viewOf(content: StoredNode[], values: Record<string, string>) {
  const doc = readDocumentFile(
    { formatVersion: 1, values, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [createDynamicTemplates()] }),
  });
}

const holder = (fragment: DocumentFragment) => {
  const element = document.createElement('div');
  element.appendChild(fragment);
  return element;
};

describe('template blocks', () => {
  it('DOCE-TEMPLATES-9.1 renders the markup with each token replaced by the text the document stores', () => {
    const view = viewOf([block('<h2>{{document.title}}</h2><p>By {{ document.owner }}</p>')], {
      'document.title': 'Interface notes',
    });
    const shown = view.dom.querySelector('.dynamic-template-block');
    expect(shown?.querySelector('h2')).toHaveTextContent('Interface notes');
    expect(shown?.querySelector('p')?.textContent).toBe('By');
    expect(shown).toHaveAttribute('contenteditable', 'false');
    expect(shown?.getAttribute('data-de-measure-key')).toContain('document.title=Interface notes');
    // Rendering changes what shows, never the document.
    const before = view.state.doc;
    view.dispatch(refreshDynamicTemplates(view.state.tr));
    expect(view.state.doc).toBe(before);
    // A stored text the edit changes renders the block again.
    view.dispatch(view.state.tr.setDocAttribute('values', { 'document.title': 'Timing notes' }));
    const again = view.dom.querySelector('.dynamic-template-block');
    expect(again?.querySelector('h2')).toHaveTextContent('Timing notes');
    expect(again?.getAttribute('data-de-measure-key')).toContain('document.title=Timing notes');
    view.destroy();
  });

  it('DOCE-TEMPLATES-9.2 renders only the schema nodes and inserts values as text', () => {
    const rendered = holder(
      renderTemplateBlock(
        '<p onclick="alert(1)">{{name}}<img src="x" onerror="alert(1)"></p><script>alert(1)</script><iframe src="x"></iframe>',
        { schema: documentSchema, document },
        () => '<b>bold</b>',
      ),
    );
    expect(rendered.querySelector('script, iframe, b')).toBeNull();
    expect(rendered.innerHTML).not.toContain('onclick');
    expect(rendered.innerHTML).not.toContain('onerror');
    expect(rendered.querySelector('p')).toHaveTextContent('<b>bold</b>');
  });

  it('DOCE-TEMPLATES-9.3 tracks its keys, or the keys of its tokens, and shows the stored date', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [block('<p>{{a}} {{b}} {{a}}</p>'), block('<p>{{a}}</p>', 'c, d')],
          },
        ],
      },
      documentSchema,
    ).doc;
    const keys: string[][] = [];
    doc.descendants((node) => {
      if (node.type.name === 'dynamic_template') keys.push(templateBlockKeys(node));
    });
    expect(keys).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const dated = holder(
      renderTemplateBlock('<p>{{date.current}}</p>', { schema: documentSchema, document }, (key) =>
        key === 'date.current' ? 'January 31, 2026' : '',
      ),
    );
    expect(dated).toHaveTextContent('January 31, 2026');
  });
});
