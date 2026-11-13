import { Slice } from 'prosemirror-model';
import { type EditorState, Plugin } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalState, mount, positionOf } from '../../test/projection-fixtures.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('the canonical plugins on the pages', () => {
  it('DOCE-PAGINATION-7.15 hands the canonical plugins a drop and a paste on the pages', () => {
    const seen: { type: string; state: EditorState }[] = [];
    const take = (view: { readonly state: EditorState }, event: Event) => {
      seen.push({ type: event.type, state: view.state });
      return true;
    };
    const clipboard = new Plugin({ props: { handleDOMEvents: { drop: take, paste: take } } });
    const { projection } = mount({ state: canonicalState([clipboard]) });
    const { view } = projection;
    for (const type of ['drop', 'paste']) {
      view.dom.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }
    expect(seen).toEqual([
      { type: 'drop', state: projection.state },
      { type: 'paste', state: projection.state },
    ]);
  });

  it('DOCE-PAGINATION-7.15 runs the canonical plugins’ node clicks, drops and key presses at canonical places', () => {
    const seen: unknown[] = [];
    const host = new Plugin({
      props: {
        handleClickOn: (view, pos, node, nodePos) => {
          seen.push({ click: pos, node: node.type.name, nodePos, doc: view.state.doc });
          return true;
        },
        handleDrop: (view, _event, slice, moved) => {
          seen.push({ drop: slice.size, moved, doc: view.state.doc });
          return true;
        },
        handleKeyPress: (view, event) => {
          seen.push({ key: event.key, doc: view.state.doc });
          return true;
        },
      },
    });
    const { projection } = mount({ state: canonicalState([host]) });
    const { view, state } = projection;
    const at = positionOf(view.state.doc, 'Gamma');
    const $at = view.state.doc.resolve(at);
    const click = new MouseEvent('click');
    const clicked = view.someProp('handleClickOn', (handle) =>
      handle(view, at, $at.parent, $at.before(), click, true),
    );
    const dropped = view.someProp('handleDrop', (handle) =>
      handle(view, new Event('drop') as DragEvent, Slice.empty, true),
    );
    const press = new KeyboardEvent('keypress', { key: 'x' });
    const pressed = view.someProp('handleKeyPress', (handle) => handle(view, press));
    expect([clicked, dropped, pressed]).toEqual([true, true, true]);
    const canonicalAt = positionOf(state.doc, 'Gamma');
    expect(seen).toEqual([
      {
        click: canonicalAt,
        node: 'paragraph',
        nodePos: state.doc.resolve(canonicalAt).before(),
        doc: state.doc,
      },
      { drop: 0, moved: true, doc: state.doc },
      { key: 'x', doc: state.doc },
    ]);
  });

  it('DOCE-PAGINATION-7.15 gives the editor the canonical plugins’ attributes', () => {
    const resizing = new Plugin({ props: { attributes: { class: 'resize-cursor' } } });
    const labelled = new Plugin({
      props: { attributes: () => ({ class: 'busy', 'data-mode': 'edit' }) },
    });
    const { projection } = mount({ state: canonicalState([resizing, labelled]) });
    const { dom } = projection.view;
    expect(dom).toHaveClass('resize-cursor');
    expect(dom).toHaveClass('busy');
    expect(dom).toHaveAttribute('data-mode', 'edit');
  });
});
