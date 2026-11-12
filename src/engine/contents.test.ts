import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE, readDocumentFile, type StoredNode } from '../model/index.js';
import { createContents } from './contents.js';

const abbreviation: StoredNode = {
  type: 'abbreviation',
  attrs: { entry: 'g1', abbreviation: 'GSE', expansion: 'Ground support equipment' },
};

function viewOf(editable: boolean) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [abbreviation] },
            { type: 'contents', attrs: { kind: 'abbreviations' } },
          ],
        },
      ],
    },
    documentSchema,
  );
  const state = EditorState.create({
    doc,
    plugins: [createContents({ template: () => BASE_TEMPLATE })],
  });
  return new EditorView(document.body.appendChild(document.createElement('div')), {
    state,
    editable: () => editable,
  });
}

const originalScroll = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScroll;
  document.body.replaceChildren();
});

describe('contents anchors', () => {
  it('DOCE-CONTENTS-2.6 gives each abbreviation entry its anchor, and an abbreviation goes to it', () => {
    const view = viewOf(false);
    const entry = view.dom.querySelector('.de-contents__entry');
    expect(entry).toHaveAttribute('id', 'abbr-g1');
    expect(view.dom.querySelector('a[href="#abbr-g1"]')).not.toBeNull();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    let pos = -1;
    view.state.doc.descendants((node, at) => {
      if (node.type.name === 'abbreviation_reference') pos = at;
    });
    const event = new MouseEvent('click', { cancelable: true });
    const handled = view.someProp('handleClickOn', (handle) =>
      handle(view, pos, view.state.doc.nodeAt(pos) ?? view.state.doc, pos, event, true),
    );
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(entry);
    view.destroy();
  });

  it('DOCE-CONTENTS-2.6 leaves a plain click in an edited document to the caret', () => {
    const view = viewOf(true);
    let pos = -1;
    view.state.doc.descendants((each, at) => {
      if (each.type.name === 'abbreviation_reference') pos = at;
    });
    const event = new MouseEvent('click', { cancelable: true });
    const handled = view.someProp('handleClickOn', (handle) =>
      handle(view, pos, view.state.doc.nodeAt(pos) ?? view.state.doc, pos, event, true),
    );
    expect(handled).toBeFalsy();
    view.destroy();
  });
});
