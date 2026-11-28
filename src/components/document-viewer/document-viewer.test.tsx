import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Node } from 'prosemirror-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../../test/pages-fixtures.js';
import { BASE_TEMPLATE } from '../../model/index.js';
import { engineNumbers } from '../../pagination/engine-numbers.js';
import { pagesLayout } from '../../pagination/pages-layout.js';
import { createProjectionMap } from '../../pagination/projection-map.js';
import { DocumentViewer } from './document-viewer.js';

const paragraph = (value: string): Node =>
  node('paragraph', { dataId: value }, [documentSchema.text(value)]);
const heading = (value: string): Node =>
  node('heading', { level: 1, dataId: value }, [documentSchema.text(value)]);

const figure = (index: number): Node =>
  node('figure', {
    dataId: `f${String(index)}`,
    src: `image-${String(index)}.png`,
    alt: '',
    width: 40,
    height: 30,
  });

// Ten pages, each with a heading the engine numbers after its page and a paragraph drawn on lines
// of four characters, and, `withImages`, a figure of an image of its own; `title` starts each heading.
function tenPages(count = 10, withImages = false, title = 'Part') {
  const pages = Array.from({ length: count }, (_, index) =>
    page(
      [
        heading(`${title}${String(index)}`),
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
  const map = createProjectionMap(doc);
  const numbers = engineNumbers({ engine: () => engine, map: () => map });
  const layout = pagesLayout(pagesState(doc, engine, [numbers]));
  if (!layout) throw new Error('no layout');
  return layout;
}

// An intersection observer the test drives: it reports the sheets it is told are in view.
const observed: {
  callback: IntersectionObserverCallback;
  targets: Element[];
  refreshed: Element[];
  init: IntersectionObserverInit | undefined;
}[] = [];
class FakeObserver {
  readonly targets: Element[] = [];
  readonly refreshed: Element[] = [];
  constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
    observed.push({ callback, targets: this.targets, refreshed: this.refreshed, init });
  }
  observe(target: Element) {
    if (!this.targets.includes(target)) this.targets.push(target);
  }
  unobserve(target: Element) {
    this.refreshed.push(target);
  }
  disconnect() {
    this.targets.length = 0;
  }
}

function showInView(indexes: readonly number[], changed?: readonly number[]) {
  const [last] = observed.slice(-1);
  if (!last) throw new Error('no observer');
  const entries = last.targets.flatMap((target, index) =>
    !changed || changed.includes(index)
      ? [{ target, isIntersecting: indexes.includes(index) } as IntersectionObserverEntry]
      : [],
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

  it.each([
    [1.5, [3, 4, 5]],
    [-1, [4]],
    [NaN, [4]],
  ] as const)(
    'DOCE-PAGINATION-13.6 draws the visible page with overscan %s',
    (overscan, expected) => {
      vi.stubGlobal('IntersectionObserver', FakeObserver);
      const { container } = render(
        <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} overscan={overscan} />,
      );
      showInView([4]);
      expect(drawn(container)).toEqual(expected);
    },
  );

  it('DOCE-PAGINATION-13.6 draws the pages a screen beyond its scrolling frame', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    let height = 320;
    render(
      <div
        style={{ overflowY: 'auto' }}
        data-frame=""
        ref={(element) => {
          if (element) Object.defineProperty(element, 'clientHeight', { get: () => height });
        }}
      >
        <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />
      </div>,
    );
    const init = observed.at(-1)?.init;
    expect(init?.rootMargin).toBe('320px 0px');
    expect(init?.root).toBe(document.querySelector('[data-frame]'));
    height = 480;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(observed.at(-1)?.init?.rootMargin).toBe('480px 0px');
  });

  it('DOCE-PAGINATION-13.6 finds its scrolling frame again once another ancestor scrolls', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(
      <div data-frame="">
        <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />
      </div>,
    );
    const frame = container.querySelector<HTMLElement>('[data-frame]');
    if (!frame) throw new Error('no frame');
    expect(observed.at(-1)?.init?.root).toBe(document);
    const before = observed.length;
    // The window scrolling, or the frame scrolling while it does not scroll by style, changes
    // nothing.
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      frame.dispatchEvent(new Event('scroll'));
    });
    expect(observed).toHaveLength(before);
    // The frame starts scrolling: its first scroll moves the observer onto it.
    frame.style.overflowY = 'auto';
    act(() => {
      frame.dispatchEvent(new Event('scroll'));
    });
    expect(observed).toHaveLength(before + 1);
    expect(observed.at(-1)?.init?.root).toBe(frame);
    expect(observed.at(-1)?.targets).toHaveLength(10);
    showInView([6]);
    expect(drawn(container)).toEqual([5, 6, 7]);
    // Its own scrolls make no new observer.
    act(() => {
      frame.dispatchEvent(new Event('scroll'));
    });
    expect(observed).toHaveLength(before + 1);
  });

  it('DOCE-PAGINATION-13.6 finds its scrolling frame again when moved into another', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const resized: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resized.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(
      <div style={{ overflowY: 'auto' }} data-frame="one">
        <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />
      </div>,
    );
    const viewer = container.querySelector('.de-document-viewer');
    const one = container.querySelector('[data-frame="one"]');
    const other = document.createElement('div');
    other.style.overflowY = 'scroll';
    document.body.append(other);
    expect(observed.at(-1)?.init?.root).toBe(one);
    // The host moves the viewer: its size changes as it leaves and joins the page.
    if (!viewer) throw new Error('no viewer');
    other.append(viewer);
    act(() => resized.forEach((callback) => callback([], {} as ResizeObserver)));
    expect(observed.at(-1)?.init?.root).toBe(other);
    showInView([0]);
    expect(drawn(other)).toEqual([0, 1]);
    one?.append(viewer);
    other.remove();
  });

  it('DOCE-PAGINATION-13.6 keeps its drawn pages when given options of the same fields again', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const layout = tenPages();
    const href = () => null;
    const { container, rerender } = render(
      <DocumentViewer layout={layout} template={BASE_TEMPLATE} options={{ citationHref: href }} />,
    );
    showInView([2]);
    const drawnPage = sheets(container)[2]?.firstElementChild;
    expect(drawnPage).toBeTruthy();
    rerender(
      <DocumentViewer layout={layout} template={BASE_TEMPLATE} options={{ citationHref: href }} />,
    );
    expect(observed).toHaveLength(1);
    expect(sheets(container)[2]?.firstElementChild).toBe(drawnPage);
    rerender(
      <DocumentViewer
        layout={layout}
        template={BASE_TEMPLATE}
        options={{ citationHref: () => null }}
      />,
    );
    expect(observed).toHaveLength(2);
  });

  it('DOCE-PAGINATION-13.6 refreshes its drawing when an undefined option changes names', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const layout = tenPages();
    const { rerender } = render(
      <DocumentViewer
        layout={layout}
        template={BASE_TEMPLATE}
        options={{ citationHref: undefined }}
      />,
    );
    rerender(
      <DocumentViewer
        layout={layout}
        template={BASE_TEMPLATE}
        options={{ resolveImage: undefined }}
      />,
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

  it('DOCE-PAGINATION-13.6 leaves distant sheets untouched while the visible window moves', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(
      <DocumentViewer layout={tenPages(300)} template={BASE_TEMPLATE} />,
    );
    const [distant] = sheets(container);
    if (!distant) throw new Error('no page');
    const inspected = vi.spyOn(distant, 'hasAttribute');
    showInView([40], [40]);
    const retained = sheets(container)[40]?.firstElementChild;
    expect(retained).toBeTruthy();
    showInView([41], [40, 41]);
    expect(inspected).not.toHaveBeenCalled();
    expect(drawn(container)).toEqual([40, 41, 42]);
    expect(sheets(container)[40]?.firstElementChild).toBe(retained);
  });

  it('DOCE-PAGINATION-13.6 watches the implicit root where the observer takes no document root', () => {
    class ElementRootObserver extends FakeObserver {
      constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        if (init?.root instanceof Document) throw new TypeError('root is not an element');
        super(callback, init);
      }
    }
    vi.stubGlobal('IntersectionObserver', ElementRootObserver);
    const { container } = render(<DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />);
    const init = observed.at(-1)?.init;
    expect(init?.root).toBeNull();
    expect(init?.rootMargin).toBe(`${String(window.innerHeight)}px 0px`);
    showInView([4]);
    expect(drawn(container)).toEqual([3, 4, 5]);
  });

  it('DOCE-PAGINATION-13.6 draws all pages where its window has no intersection observer', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />);
    expect(drawn(container)).toHaveLength(10);
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

  it('DOCE-PAGINATION-13.6 draws a new layout’s pages, never those it drew for the layout before', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const heading = (container: HTMLElement) =>
      sheets(container)[0]?.querySelector('h1')?.textContent;
    const { container, rerender } = render(
      <DocumentViewer layout={tenPages(3)} template={BASE_TEMPLATE} overscan={0} />,
    );
    showInView([0]);
    expect(heading(container)).toBe('Part0');
    // A new layout, as an edit gives: each page is drawn from it, not from the old drawing.
    rerender(
      <DocumentViewer
        layout={tenPages(3, false, 'Edited')}
        template={BASE_TEMPLATE}
        overscan={0}
      />,
    );
    expect(drawn(container)).toEqual([]);
    showInView([0]);
    expect(heading(container)).toBe('Edited0');
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

  it('DOCE-PAGINATION-12.8 DOCE-PAGINATION-13.8 draws served faces and fallbacks under a viewer’s own family through mount and unmount', async () => {
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
    const template = {
      ...BASE_TEMPLATE,
      styles: { ...BASE_TEMPLATE.styles, heading1: { font: 'Unserved Heading' } },
    };
    const family = (root: Element | null, field = 'paragraph') =>
      root instanceof HTMLElement
        ? root.style.getPropertyValue(`--doc-${field}-font-family`)
        : null;
    const { container: inFirst, unmount: unmountFirst } = render(
      <DocumentViewer layout={arimo} template={template} label="First" />,
    );
    await act(async () => undefined);
    const own = family(inFirst.firstElementChild);
    expect(own).toContain('Arial');
    expect(family(inFirst.firstElementChild, 'heading-1')).toBe(own);
    // The same files are shared; other files under the family are drawn in one of the viewer's own.
    const { container: inSame, unmount: unmountSame } = render(
      <DocumentViewer layout={arimo} template={template} />,
    );
    const { container: inOther, unmount: unmountOther } = render(
      <DocumentViewer layout={cousine} template={template} />,
    );
    await act(async () => undefined);
    expect(made).toEqual(['Arial', expect.stringMatching(/^Arial de-\d+$/u)]);
    expect(family(inSame.firstElementChild)).toBe(own);
    const otherFamily = family(inOther.firstElementChild);
    expect(otherFamily).toContain(made[1]);
    expect(family(inOther.firstElementChild, 'heading-1')).toBe(otherFamily);
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
    expect(observed.at(-1)?.refreshed).toEqual([sheets(container)[8]]);
    // If scroll never intersects the destination, its refreshed report still releases the page.
    showInView([0], [8]);
    expect(drawn(container)).toEqual([0]);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  // The viewer on page 0 of ten, a link on it to the anchor given, and what scrolled into view.
  function linkOnFirstPage(href: string, layout = tenPages()) {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const scrolled: string[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element) {
        scrolled.push(this.id);
      },
    });
    const { container } = render(
      <DocumentViewer layout={layout} template={BASE_TEMPLATE} overscan={0} />,
    );
    showInView([0]);
    const link = document.createElement('a');
    link.setAttribute('href', href);
    link.textContent = 'Go there';
    sheets(container)[0]?.append(link);
    return { container, scrolled, link: screen.getByRole('link', { name: 'Go there' }) };
  }

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('DOCE-PAGINATION-13.9 follows a fragment with a literal percent sign and an encoded one', async () => {
    const doc = pagesDocument(
      Array.from({ length: 10 }, (_, index) =>
        page([paragraph(index === 6 ? '50%' : index === 8 ? 'a b' : `text${String(index)}`)]),
      ),
    );
    const layout = pagesLayout(pagesState(doc, stubEngine({ perLine: 4 })));
    if (!layout) throw new Error('no layout');
    const user = userEvent.setup();
    const literal = linkOnFirstPage('#50%', layout);
    await user.click(literal.link);
    expect(drawn(literal.container)).toEqual([0, 6]);
    expect(literal.scrolled).toEqual(['50%']);
    literal.link.setAttribute('href', '#a%20b');
    await user.click(literal.link);
    expect(drawn(literal.container)).toEqual([0, 8]);
    expect(literal.scrolled).toEqual(['50%', 'a b']);
  });

  it('DOCE-PAGINATION-13.9 leaves a modified or cancelled click to the browser', async () => {
    const { container, scrolled, link } = linkOnFirstPage('#Part8');
    const defaults: boolean[] = [];
    container.addEventListener('click', (event) => {
      defaults.push(event.defaultPrevented);
      event.preventDefault();
    });
    const user = userEvent.setup();
    for (const key of ['Control', 'Meta', 'Shift', 'Alt']) {
      await user.keyboard(`{${key}>}`);
      await user.click(link);
      await user.keyboard(`{/${key}}`);
    }
    await user.pointer({ keys: '[MouseMiddle]', target: link });
    expect(defaults).toEqual([false, false, false, false]);
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await user.click(link);
    expect(drawn(container)).toEqual([0]);
    expect(scrolled).toEqual([]);
  });

  it('DOCE-PAGINATION-13.9 follows a link activated with Enter to a distant page', async () => {
    const { container, scrolled, link } = linkOnFirstPage('#Part8');
    link.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(drawn(container)).toEqual([0, 8]);
    expect(scrolled).toEqual(['Part8']);
  });

  it('DOCE-PAGINATION-13.13 draws every page while its host page prints, and only those near the view after', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(<DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />);
    showInView([4]);
    expect(drawn(container)).toEqual([3, 4, 5]);
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(drawn(container)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(drawn(container)).toEqual([3, 4, 5]);
  });

  it('DOCE-PAGINATION-13.6 DOCE-PAGINATION-13.13 uses the viewer iframe’s observer and print events', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    try {
      const doc = frame.contentDocument;
      const view = doc?.defaultView;
      if (!doc || !view) throw new Error('no iframe document');
      Object.defineProperty(view, 'IntersectionObserver', { value: FakeObserver });
      const { container, unmount } = render(
        <DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />,
        { container: doc.body },
      );
      try {
        expect(observed.at(-1)?.init?.root).toBe(doc);
        showInView([0]);
        window.dispatchEvent(new Event('beforeprint'));
        expect(drawn(container)).toEqual([0, 1]);
        view.dispatchEvent(new view.Event('beforeprint'));
        expect(drawn(container)).toHaveLength(10);
        view.dispatchEvent(new view.Event('afterprint'));
        expect(drawn(container)).toEqual([0, 1]);
      } finally {
        unmount();
      }
    } finally {
      frame.remove();
    }
  });

  it('DOCE-PAGINATION-13.13 draws every page while the print media query matches, without the print events', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const query = Object.assign(new EventTarget(), { matches: false, media: 'print' });
    vi.stubGlobal('matchMedia', (media: string) => {
      if (media !== 'print') throw new Error(`unexpected query ${media}`);
      return query;
    });
    const { container } = render(<DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />);
    showInView([0]);
    expect(drawn(container)).toEqual([0, 1]);
    query.matches = true;
    act(() => {
      query.dispatchEvent(new Event('change'));
    });
    expect(drawn(container)).toHaveLength(10);
    query.matches = false;
    act(() => {
      query.dispatchEvent(new Event('change'));
    });
    expect(drawn(container)).toEqual([0, 1]);
  });

  it('DOCE-PAGINATION-13.13 draws every page when mounted while the print media query already matches', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const query = Object.assign(new EventTarget(), { matches: true, media: 'print' });
    vi.stubGlobal('matchMedia', () => query);
    const { container } = render(<DocumentViewer layout={tenPages()} template={BASE_TEMPLATE} />);
    showInView([0]);
    expect(drawn(container)).toHaveLength(10);
  });
});
