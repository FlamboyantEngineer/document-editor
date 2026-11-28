import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deferred } from '../../test/deferred.js';
import { documentSchema } from '../../test/document-markup.js';
import { mount } from '../../test/projection-fixtures.js';
import { BASE_TEMPLATE, readDocumentFile } from '../model/index.js';
import { documentSnapshotWhenReady } from './snapshot-ready.js';

// A page with two figures showing the same image and one showing another.
function figuresView() {
  const figure = (src: string) => ({
    type: 'figure',
    attrs: { src, alt: 'Chart', width: 40, height: 30 },
  });
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

  it('DOCE-EDITOR-6.26 stops a snapshot that awaits the destroyed projection', async () => {
    const { projection } = mount();
    const snapshot = documentSnapshotWhenReady(projection.view, {
      template: BASE_TEMPLATE,
      whenSettled: projection.whenSettled,
    });
    projection.destroy();
    await expect(snapshot).rejects.toThrow('The document layout is unavailable.');
    document.body.replaceChildren();
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

  it('DOCE-EDITOR-6.26 keeps the captured images if the live document changes during resolution', async () => {
    const view = figuresView();
    const started = deferred<void>();
    const resolved = deferred<string>();
    const asked: string[] = [];
    const snapshot = documentSnapshotWhenReady(view, {
      template: BASE_TEMPLATE,
      whenSettled: () => Promise.resolve(),
      resolveImage(src) {
        asked.push(src);
        if (src !== 'a.png') return null;
        started.resolve();
        return resolved.promise;
      },
    });
    await started.promise;
    const tr = view.state.tr;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'figure' && node.attrs.src === 'a.png')
        tr.setNodeAttribute(pos, 'src', 'new.png');
    });
    view.dispatch(tr);
    expect(sources(view.dom.outerHTML)).toEqual(['new.png', 'new.png', 'b.png']);
    resolved.resolve('signed/a.png');
    expect(sources(await snapshot)).toEqual(['signed/a.png', 'signed/a.png', 'b.png']);
    expect(asked).toEqual(['a.png', 'b.png']);
    view.destroy();
  });

  it('DOCE-EDITOR-6.26 rejects a capture when its view is destroyed during image resolution', async () => {
    const view = figuresView();
    const started = deferred<void>();
    const resolved = deferred<string>();
    const snapshot = documentSnapshotWhenReady(view, {
      template: BASE_TEMPLATE,
      whenSettled: () => Promise.resolve(),
      resolveImage() {
        started.resolve();
        return resolved.promise;
      },
    });
    await started.promise;
    view.destroy();
    resolved.resolve('signed/a.png');
    await expect(snapshot).rejects.toThrow('The document layout is unavailable.');
  });
});
