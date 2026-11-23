import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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

const figure = (index: number): Node =>
  node('figure', { dataId: `f${String(index)}`, src: `image-${String(index)}.png`, alt: '' });

// Ten pages, each with a heading the engine numbers after its page and a paragraph drawn on lines
// of four characters, and, `withImages`, a figure of an image of its own.
function tenPages(count = 10, withImages = false) {
  const pages = Array.from({ length: count }, (_, index) =>
    page(
      [
        heading(`Part${String(index)}`),
        paragraph(`text${String(index)} more`),
        ...(withImages ? [figure(index)] : []),
      ],
      {
        pageNumber: index + 1,
        totalPages: count,
      },
    ),
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
const observed: {
  callback: IntersectionObserverCallback;
  targets: Element[];
  init: IntersectionObserverInit | undefined;
}[] = [];
class FakeObserver {
  readonly targets: Element[] = [];
  constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
    observed.push({ callback, targets: this.targets, init });
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

  it('DOCE-PAGINATION-13.6 draws the pages a screen beyond its scrolling frame', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(
      <div style={{ overflowY: 'auto' }} data-frame="">
        <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />
      </div>,
    );
    const init = observed.at(-1)?.init;
    expect(init?.rootMargin).toBe('100% 0px');
    expect(init?.root).toBe(document.querySelector('[data-frame]'));
  });

  it('DOCE-PAGINATION-13.6 keeps its drawn pages when given options of the same fields again', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const layout = tenPages();
    const { container, rerender } = render(
      <DocumentViewer layout={layout} template={BASE_TEMPLATE} options={{ markup: 'all' }} />,
    );
    showInView([2]);
    const drawnPage = sheets(container)[2]?.firstElementChild;
    expect(drawnPage).toBeTruthy();
    rerender(
      <DocumentViewer layout={layout} template={BASE_TEMPLATE} options={{ markup: 'all' }} />,
    );
    expect(observed).toHaveLength(1);
    expect(sheets(container)[2]?.firstElementChild).toBe(drawnPage);
    rerender(
      <DocumentViewer layout={layout} template={BASE_TEMPLATE} options={{ markup: 'final' }} />,
    );
    expect(observed).toHaveLength(2);
  });

  it('DOCE-PAGINATION-13.6 shows a 300-page document with only the pages near the view drawn', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(
      <DocumentViewer layout={tenPages(300)} template={BASE_TEMPLATE} />,
    );
    expect(sheets(container)).toHaveLength(300);
    showInView([299]);
    expect(drawn(container)).toEqual([298, 299]);
    expect(sheets(container)[299]?.querySelector('h1')?.getAttribute('data-number')).toBe('300');
  });

  it('DOCE-PAGINATION-13.10 draws its pages in the language they were laid out in, not its host page’s', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const turkish = { ...tenPages(2), language: 'tr' };
    const { rerender } = render(
      <div lang="en">
        <DocumentViewer layout={turkish} template={BASE_TEMPLATE} label="Turkish" />
      </div>,
    );
    expect(screen.getByRole('document', { name: 'Turkish' })).toHaveAttribute('lang', 'tr');
    rerender(
      <div lang="en">
        <DocumentViewer layout={tenPages(2)} template={BASE_TEMPLATE} label="Unnamed" />
      </div>,
    );
    // None around the editor's pages: none here either, rather than the host page's English.
    expect(screen.getByRole('document', { name: 'Unnamed' })).toHaveAttribute('lang', '');
  });

  it('DOCE-PAGINATION-13.6 draws a page’s content and asks for its images only as it comes into view', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const resolveImage = vi.fn((src: string) => `https://assets.example.test/${src}`);
    const { container } = render(
      <DocumentViewer
        layout={tenPages(300, true)}
        template={BASE_TEMPLATE}
        options={{ resolveImage }}
        overscan={0}
      />,
    );
    // Open: every sheet, no page drawn and no image asked for.
    expect(sheets(container)).toHaveLength(300);
    expect(resolveImage).not.toHaveBeenCalled();
    showInView([0]);
    expect(resolveImage.mock.calls).toEqual([['image-0.png']]);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    // A jump to page 150 draws it alone and asks for its image once.
    showInView([150]);
    expect(resolveImage.mock.calls).toEqual([['image-0.png'], ['image-150.png']]);
    const images = [...container.querySelectorAll('img')];
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      'https://assets.example.test/image-150.png',
    ]);
    // Back to the first page: drawn again from what it drew before, without asking again.
    showInView([0]);
    expect(resolveImage).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-13.8 adds the served faces to its document while it shows the pages', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const made: { family: string; descriptors: FontFaceDescriptors }[] = [];
    class FakeFace {
      constructor(family: string, _bytes: unknown, descriptors: FontFaceDescriptors) {
        made.push({ family, descriptors });
      }
      load() {
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', FakeFace);
    const added = new Set<unknown>();
    const fonts = {
      add: (face: unknown) => added.add(face),
      delete: (face: unknown) => added.delete(face),
    };
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x46]);
    const layout = {
      ...tenPages(),
      fonts: { faces: [{ family: 'Tinos', weight: 700, style: 'italic' as const, bytes }] },
    };
    const { unmount } = render(<DocumentViewer layout={layout} template={BASE_TEMPLATE} />);
    expect(made).toEqual([{ family: 'Tinos', descriptors: { weight: '700', style: 'italic' } }]);
    expect(added.size).toBe(1);
    unmount();
    expect(added.size).toBe(0);
    Reflect.deleteProperty(document, 'fonts');
  });

  it('DOCE-PAGINATION-12.8 draws other files under a family another viewer holds in a family of its own, through mount and unmount', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const made: string[] = [];
    class FakeFace {
      constructor(family: string) {
        made.push(family);
      }
      load() {
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', FakeFace);
    const added = new Set<unknown>();
    const fonts = {
      add: (face: unknown) => added.add(face),
      delete: (face: unknown) => added.delete(face),
    };
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    const served = (bytes: Uint8Array<ArrayBuffer>) => ({
      ...tenPages(1),
      fonts: { faces: [{ family: 'Arial', weight: 400, style: 'normal' as const, bytes }] },
    });
    const arimo = served(new Uint8Array([1]));
    const cousine = served(new Uint8Array([2]));
    const family = (root: Element | null) =>
      root instanceof HTMLElement
        ? root.style.getPropertyValue('--doc-paragraph-font-family')
        : null;
    const { container: inFirst, unmount: unmountFirst } = render(
      <DocumentViewer layout={arimo} template={BASE_TEMPLATE} label="First" />,
    );
    await act(async () => undefined);
    const own = family(inFirst.firstElementChild);
    expect(own).toContain('Arial');
    // The same files are shared; other files under the family are drawn in one of the viewer's own.
    const { container: inSame, unmount: unmountSame } = render(
      <DocumentViewer layout={arimo} template={BASE_TEMPLATE} />,
    );
    const { container: inOther, unmount: unmountOther } = render(
      <DocumentViewer layout={cousine} template={BASE_TEMPLATE} />,
    );
    await act(async () => undefined);
    expect(made).toEqual(['Arial', expect.stringMatching(/^Arial de-\d+$/u)]);
    expect(family(inSame.firstElementChild)).toBe(own);
    const otherFamily = family(inOther.firstElementChild);
    expect(otherFamily).toContain(made[1]);
    expect(family(inFirst.firstElementChild)).toBe(own);
    // Unmounting either leaves the first viewer's faces and family as they were.
    unmountOther();
    unmountSame();
    expect(added.size).toBe(1);
    expect(family(inFirst.firstElementChild)).toBe(own);
    unmountFirst();
    expect(added.size).toBe(0);
    Reflect.deleteProperty(document, 'fonts');
  });

  it('DOCE-PAGINATION-13.9 draws the page a link goes to, though it is not drawn, and goes to its anchor', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const scrolled: string[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element) {
        scrolled.push(this.id);
      },
    });
    const { container } = render(
      <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} overscan={0} />,
    );
    showInView([0]);
    expect(drawn(container)).toEqual([0]);
    const link = document.createElement('a');
    link.href = '#Part8';
    link.textContent = 'See part 8';
    sheets(container)[0]?.append(link);
    await userEvent.setup().click(screen.getByRole('link', { name: 'See part 8' }));
    expect(drawn(container)).toEqual([0, 8]);
    expect(scrolled).toEqual(['Part8']);
    expect(window.location.hash).toBe('');
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });
});
