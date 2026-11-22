import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '../../test/projection-fixtures.js';
import { markLayout, pageMetrics } from './layout-marks.js';
import { createPageDebug, debugLength, type PageDebugParts } from './page-debug.js';

afterEach(() => {
  document.body.replaceChildren();
});

const SHEET = { width: 800, height: 1100, margins: { top: 50, right: 40, bottom: 50, left: 60 } };

// A projection whose pages show the parts the test sets.
function mountDebugged(initial: PageDebugParts) {
  let parts = initial;
  const debug = createPageDebug({ shown: () => parts, sheet: () => SHEET });
  const mounted = mount({ plugins: [debug] });
  mounted.drain();
  const show = (next: PageDebugParts) => {
    parts = next;
    const { view } = mounted.projection;
    view.dispatch(view.state.tr.setMeta('addToHistory', false));
  };
  return { ...mounted, show };
}

const pages = () => [...document.body.querySelectorAll<HTMLElement>('.pm-page')];

describe('page debug', () => {
  it('DOCE-PAGINATION-7.4 writes lengths in CSS pixels with three decimals', () => {
    expect(debugLength(12)).toBe('12.000');
    expect(debugLength(0.12345)).toBe('0.123');
  });

  it('DOCE-PAGINATION-7.4 labels each page with its sheet, regions and what its blocks take', () => {
    mountDebugged({ pages: true });
    const [first] = pages();
    expect(first).toHaveAttribute('data-debug-paper', '800.000 × 1100.000');
    expect(first).toHaveAttribute('data-debug-content', '700.000 × 1000.000');
    expect(first).toHaveAttribute('data-debug-used', '800.000');
    expect(first).toHaveAttribute('data-debug-stacked', '800.000');
    expect(first).toHaveAttribute('data-debug-free', '200.000');
    expect(first).toHaveAttribute('data-debug-header', '0.000');
    expect(first).toHaveAttribute('data-debug-footer', '0.000');
    expect(first).toHaveAttribute('data-debug-dpr', debugLength(window.devicePixelRatio));
    expect(first?.querySelector('[data-debug-type]')).toBeNull();
  });

  it('DOCE-PAGINATION-7.4 marks each region and block with its type, height and top', () => {
    mountDebugged({ blocks: true });
    const [first] = pages();
    expect(first).not.toHaveAttribute('data-debug-used');
    const content = first?.querySelector('.pm-page-content');
    expect(content).toHaveAttribute('data-debug-type', 'page_content');
    const blocks = [...(content?.querySelectorAll(':scope > p') ?? [])];
    expect(blocks.map((block) => block.getAttribute('data-debug-type'))).toEqual([
      'paragraph',
      'paragraph',
    ]);
    expect(blocks.map((block) => block.getAttribute('data-debug-height'))).toEqual([
      '400.000',
      '400.000',
    ]);
    expect(blocks.map((block) => block.getAttribute('data-debug-top'))).toEqual([
      '0.000',
      '400.000',
    ]);
    expect(blocks.some((block) => block.hasAttribute('data-debug-overflow'))).toBe(false);
  });

  it('DOCE-PAGINATION-7.4 shows a layout that kept the same pages, as after an atom settled', () => {
    const { projection } = mountDebugged({ blocks: true });
    const { view } = projection;
    const metrics = pageMetrics(view.state) ?? [];
    const taller = metrics.map((metric) => ({
      ...metric,
      blocks: metric.blocks.map((height) => height + 25),
    }));
    view.dispatch(markLayout(view.state.tr, { metrics: taller, stats: projection.stats() }));
    const heights = [...(pages()[0]?.querySelectorAll('.pm-page-content > p') ?? [])].map((block) =>
      block.getAttribute('data-debug-height'),
    );
    expect(heights).toEqual(['425.000', '425.000']);
  });

  it('DOCE-PAGINATION-7.4 takes everything off once nothing is shown', () => {
    const { show } = mountDebugged({ pages: true, blocks: true });
    expect(pages()[0]).toHaveAttribute('data-debug-used');
    show({});
    expect(document.body.querySelector('[data-debug-used], [data-debug-type]')).toBeNull();
  });
});
