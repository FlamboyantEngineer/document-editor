import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { headlessEditor, readFixture } from '../../test/collab-fixtures.js';
import type { DocumentFile } from '../model/index.js';
import { holdDuringGestures } from './gesture-hold.js';
import { createCollabSync } from './sync.js';

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text: 'Text' }] },
      ],
    },
  ],
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

// A reader's view on the page and another writer's headless editor, sharing one room at once.
function room() {
  const readerDoc = new Y.Doc();
  const writerDoc = new Y.Doc();
  readerDoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'network') Y.applyUpdate(writerDoc, update, 'network');
  });
  writerDoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'network') Y.applyUpdate(readerDoc, update, 'network');
  });
  const host = document.body.appendChild(document.createElement('div'));
  const view = new EditorView(host, {
    state: EditorState.create({
      doc: readFixture(FILE),
      plugins: [createCollabSync({ doc: readerDoc })],
    }),
  });
  const writer = headlessEditor(readFixture(FILE), { doc: writerDoc });
  cleanups.push(() => {
    view.destroy();
    writer.destroy();
    host.remove();
  });
  const writerTypes = (text: string) => {
    writer.dispatch(writer.state.tr.insertText(text, 1));
  };
  return { view, writerTypes, text: () => view.state.doc.textContent };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('the others’ changes during a gesture', () => {
  it('DOCE-COLLAB-2.3 holds them while the pointer is pressed in the content and applies them on release', async () => {
    const { view, writerTypes, text } = room();
    await settle();
    writerTypes('A');
    await settle();
    expect(text()).toBe('AText');
    view.dom.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    writerTypes('B');
    writerTypes('C');
    await settle();
    expect(text()).toBe('AText');
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await vi.waitFor(() => expect(text()).toBe('CBAText'));
  });

  it('DOCE-COLLAB-2.3 holds them through a composition and a drag', async () => {
    const { view, writerTypes, text } = room();
    await settle();
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    writerTypes('X');
    await settle();
    expect(text()).toBe('Text');
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await vi.waitFor(() => expect(text()).toBe('XText'));
    view.dom.dispatchEvent(new Event('dragstart', { bubbles: true }));
    writerTypes('Y');
    await settle();
    expect(text()).toBe('XText');
    document.dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(text()).toBe('YXText'));
  });

  it('DOCE-COLLAB-2.3 stops holding once a gesture outlasts its limit', () => {
    vi.useFakeTimers();
    try {
      const host = document.body.appendChild(document.createElement('div'));
      const view = new EditorView(host, { state: EditorState.create({ doc: readFixture(FILE) }) });
      const onRelease = vi.fn();
      const hold = holdDuringGestures(view, onRelease, 1000);
      expect(hold.held()).toBe(false);
      view.dom.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(hold.held()).toBe(true);
      vi.advanceTimersByTime(1001);
      expect(hold.held()).toBe(false);
      expect(onRelease).toHaveBeenCalled();
      hold.destroy();
      view.destroy();
      host.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
