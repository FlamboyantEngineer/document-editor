import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE, readDocumentFile } from '../model/index.js';
import { documentSnapshotWhenReady } from './snapshot-ready.js';

// A page with two figures showing the same image and one showing another.
function figuresView() {
  const figure = (src: string) => ({ type: 'figure', attrs: { src, alt: 'Chart' } });
  const stored = {
    formatVersion: 1,
    sections: [{ name: null, content: [figure('a.png'), figure('a.png'), figure('b.png')] }],
  } as const;
  const doc = readDocumentFile(stored, documentSchema).doc;
  return new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
}

const sources = (html: string) =>
  [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')].map((image) =>
    image.getAttribute('src'),
  );

describe('documentSnapshotWhenReady', () => {
  it('DOCE-EDITOR-6.26 waits for the pages to settle, then snapshots them', async () => {
    const view = figuresView();
    const steps: string[] = [];
    const html = await documentSnapshotWhenReady(view, {
      template: BASE_TEMPLATE,
      whenSettled: async () => {
        steps.push('settled');
        await Promise.resolve();
      },
    });
    steps.push('snapshot');
    expect(steps).toEqual(['settled', 'snapshot']);
    expect(sources(html)).toEqual(['a.png', 'a.png', 'b.png']);
    view.destroy();
  });

  it('DOCE-EDITOR-6.26 resolves each image address once, answering later, or keeps it', async () => {
    const view = figuresView();
    const asked: string[] = [];
    const html = await documentSnapshotWhenReady(view, {
      template: BASE_TEMPLATE,
      whenSettled: () => Promise.resolve(),
      resolveImage: async (src) => {
        asked.push(src);
        await Promise.resolve();
        return src === 'a.png' ? 'data:image/png;base64,AA' : null;
      },
    });
    expect(asked).toEqual(['a.png', 'b.png']);
    expect(sources(html)).toEqual([
      'data:image/png;base64,AA',
      'data:image/png;base64,AA',
      'b.png',
    ]);
    view.destroy();
  });
});
