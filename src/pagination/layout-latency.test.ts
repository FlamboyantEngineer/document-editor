import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { layoutNow, wantsLayoutNow } from './layout-latency.js';

const state = () => EditorState.create({ doc: parseMarkup('<p>One</p><p>Two</p>') });

describe('layout latency', () => {
  it('DOCE-PAGINATION-5.7 lays out at once after anything but typing in one textblock', () => {
    expect(wantsLayoutNow(state().tr.insertText('x', 2))).toBe(false);
    expect(wantsLayoutNow(state().tr.delete(1, 2))).toBe(false);
    expect(wantsLayoutNow(state().tr)).toBe(false);
    expect(wantsLayoutNow(state().tr.split(2))).toBe(true);
    expect(wantsLayoutNow(state().tr.delete(2, 7))).toBe(true);
    expect(wantsLayoutNow(state().tr.insertText('x', 2).setMeta('uiEvent', 'paste'))).toBe(true);
    expect(wantsLayoutNow(layoutNow(state().tr))).toBe(true);
  });
});
