import { type EditorState, Plugin } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalState, mount } from '../../test/projection-fixtures.js';

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
});
