import { act, render, screen } from '@testing-library/react';
import type { Node } from 'prosemirror-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../../test/pages-fixtures.js';
import { BASE_TEMPLATE } from '../../model/index.js';
import { engineNumbers } from '../../pagination/engine-numbers.js';
import { pagesLayout } from '../../pagination/pages-layout.js';
import { DocumentViewer } from './document-viewer.js';

const paragraph = (value: string): Node =>
  node('paragraph', { dataId: value }, [documentSchema.text(value)]);
const heading = (value: string): Node =>
  node('heading', { level: 1, dataId: value }, [documentSchema.text(value)]);

// Ten pages, each with a heading the engine numbers after its page and a paragraph drawn on lines
// of four characters.
function tenPages() {
  const pages = Array.from({ length: 10 }, (_, index) =>
    page([heading(`Part${String(index)}`), paragraph(`text${String(index)} more`)], {
      pageNumber: index + 1,
      totalPages: 10,
    }),
  );
  const doc = pagesDocument(pages);
  const headings = new Map<number, string>();
  doc.descendants((each, pos) => {
    if (each.type.name === 'heading') headings.set(pos, String(headings.size + 1));
  });
  const engine = { ...stubEngine({ perLine: 4, headings }), template: BASE_TEMPLATE };
  const numbers = engineNumbers({ engine: () => engine, canonical: () => doc });
  const layout = pagesLayout(pagesState(doc, engine, [numbers]));
  if (!layout) throw new Error('no layout');
  return layout;
}

// An intersection observer the test drives: it reports the sheets it is told are in view.
const observed: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
class FakeObserver {
  readonly targets: Element[] = [];
  constructor(callback: IntersectionObserverCallback) {
    observed.push({ callback, targets: this.targets });
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  disconnect() {
    this.targets.length = 0;
  }
}

function showInView(indexes: readonly number[]) {
  const [last] = observed.slice(-1);
  if (!last) throw new Error('no observer');
  const entries = last.targets.map(
    (target, index) =>
      ({ target, isIntersecting: indexes.includes(index) }) as IntersectionObserverEntry,
  );
  act(() => last.callback(entries, {} as IntersectionObserver));
}

const sheets = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('.de-document-viewer .pm-page'),
];
const drawn = (container: HTMLElement) =>
  sheets(container).flatMap((sheet, index) => (sheet.hasAttribute('data-drawn') ? [index] : []));

afterEach(() => {
  observed.length = 0;
});

describe('DocumentViewer', () => {
  it('DOCE-PAGINATION-13.6 shows every page sheet and draws the ones in view with their neighbours', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(
      <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} label="Report" />,
    );
    const viewer = screen.getByRole('document', { name: 'Report' });
    expect(viewer).toHaveClass('de-document-viewer', 'de-document-editor');
    expect(viewer).toHaveAttribute('data-mode', 'reading');
    expect(viewer).toHaveAttribute('data-text-layout', 'pretext');
    expect(sheets(container)).toHaveLength(10);
    expect(drawn(container)).toEqual([]);
    showInView([4]);
    expect(drawn(container)).toEqual([3, 4, 5]);
    const fifth = sheets(container)[4];
    const paragraphOf = fifth?.querySelector('p.de-forced-lines');
    expect(paragraphOf).toHaveAttribute('data-lines', '3');
    expect(paragraphOf?.querySelectorAll('.de-forced-lines__end')).toHaveLength(2);
    showInView([9]);
    expect(drawn(container)).toEqual([8, 9]);
    expect(sheets(container)[4]?.childElementCount).toBe(0);
  });

  it('DOCE-PAGINATION-13.7 numbers a page drawn alone as the engine laid it out', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(
      <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} overscan={0} />,
    );
    showInView([6]);
    expect(drawn(container)).toEqual([6]);
    expect(sheets(container)[6]?.querySelector('h1')?.getAttribute('data-number')).toBe('7');
  });

  it('DOCE-PAGINATION-13.6 draws every page with an unbounded overscan', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(
      <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} overscan={Infinity} />,
    );
    expect(drawn(container)).toHaveLength(10);
  });
});
