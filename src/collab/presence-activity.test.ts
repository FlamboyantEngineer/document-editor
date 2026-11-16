import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { followReader } from './presence-activity.js';

function viewIn(root: HTMLElement) {
  const view = new EditorView(root, { state: EditorState.create({ schema: documentSchema }) });
  return view;
}

describe('the reader’s own input', () => {
  it('DOCE-COLLAB-1.5 takes no event made by code as the reader placing themselves', () => {
    const view = viewIn(document.createElement('div'));
    const gate = { placed: false };
    const onPlaced = vi.fn();
    const stop = followReader(view, gate, { onPlaced, onScroll: () => undefined });
    for (const type of ['pointerdown', 'keydown', 'beforeinput']) {
      view.dom.dispatchEvent(new Event(type, { bubbles: true }));
    }
    view.dom.focus();
    expect(onPlaced).not.toHaveBeenCalled();
    expect(gate.placed).toBe(false);
    stop();
    view.destroy();
  });

  it('DOCE-COLLAB-1.5 places the reader once, on their first input in the content', () => {
    const view = viewIn(document.createElement('div'));
    const gate = { placed: false };
    const onPlaced = vi.fn();
    const stop = followReader(view, gate, {
      onPlaced,
      onScroll: () => undefined,
      isReader: () => true,
    });
    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    expect(onPlaced).not.toHaveBeenCalled();
    view.dom.dispatchEvent(new Event('keydown', { bubbles: true }));
    view.dom.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(gate.placed).toBe(true);
    stop();
    view.dom.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onPlaced).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('DOCE-COLLAB-1.6 counts a wheel or touch scroll over the editor, not elsewhere', () => {
    const root = document.body.appendChild(document.createElement('div'));
    root.className = 'de-document-editor';
    const gutter = root.appendChild(document.createElement('div'));
    const view = viewIn(root.appendChild(document.createElement('div')));
    const onScroll = vi.fn();
    const stop = followReader(
      view,
      { placed: false },
      { onPlaced: () => undefined, onScroll, isReader: () => true },
    );
    gutter.dispatchEvent(new Event('wheel', { bubbles: true }));
    view.dom.dispatchEvent(new Event('touchmove', { bubbles: true }));
    document.body.dispatchEvent(new Event('wheel', { bubbles: true }));
    expect(onScroll).toHaveBeenCalledTimes(2);
    stop();
    view.destroy();
    root.remove();
  });
});
