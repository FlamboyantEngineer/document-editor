import { DOMSerializer, type Node } from 'prosemirror-model';
import { requireValue, schema } from './fixtures.js';
import type { LayoutIndex } from './protocol.js';
import { applySettings, pageGap } from './settings.js';

const serializer = DOMSerializer.fromSchema(schema);

export function renderBlock(node: Node) {
  const element = serializer.serializeNode(node) as HTMLElement;
  // Apply constraints declared by the stored table, independently of predicted row heights.
  for (const table of element.querySelectorAll('table')) {
    const columns = [
      ...table.querySelectorAll(':scope > tbody > tr:first-child > [data-colwidth]'),
    ];
    const widths = columns.map((cell) => Number(cell.getAttribute('data-colwidth')));
    const colgroup = table.querySelector('colgroup');
    if (!colgroup || !widths.length || widths.some((width) => width <= 0)) continue;
    colgroup.replaceChildren(
      ...widths.map((width) => {
        const col = document.createElement('col');
        col.style.width = `${String(width)}px`;
        return col;
      }),
    );
    table.style.width = `${String(widths.reduce((total, width) => total + width, 0))}px`;
  }
  const math = '[data-inline-type="latex"], [data-block-type="latex"]';
  for (const box of element.matches(math)
    ? [element]
    : element.querySelectorAll<HTMLElement>(math)) {
    box.textContent =
      box.getAttribute('data-inline-content') ?? box.getAttribute('data-block-content');
  }
  return element;
}

export function pageContent() {
  const body = document.createElement('div');
  body.className = 'pm-page-content';
  return body;
}

export class VirtualPages {
  private readonly mounted = new Map<number, HTMLElement>();
  private index: LayoutIndex | null = null;
  private blocks: readonly Node[] = [];
  private overscan = 1;
  private readonly onScroll = () => this.update();
  private readonly resize = new ResizeObserver(this.onScroll);

  constructor(
    private readonly scroll: HTMLElement,
    private readonly extent: HTMLElement,
  ) {
    scroll.addEventListener('scroll', this.onScroll);
    this.resize.observe(scroll);
  }

  show(index: LayoutIndex, blocks: readonly Node[], overscan: number) {
    this.clear();
    applySettings(this.scroll, index.contentWidth);
    this.index = index;
    this.blocks = blocks;
    this.overscan = overscan;
    this.extent.style.height = `${String(Math.max(0, index.pages.length * (index.height + pageGap) - pageGap))}px`;
    this.update();
  }

  setOverscan(overscan: number) {
    this.overscan = overscan;
    this.update();
  }

  clear() {
    this.index = null;
    this.blocks = [];
    this.mounted.clear();
    this.extent.replaceChildren();
    this.extent.style.height = '0';
  }

  destroy() {
    this.scroll.removeEventListener('scroll', this.onScroll);
    this.resize.disconnect();
    this.clear();
  }

  jump(page: number) {
    if (!this.index) return;
    const target = Math.max(0, Math.min(page, this.index.pages.length - 1));
    this.scroll.scrollTop = target * (this.index.height + pageGap);
    this.update();
  }

  private update() {
    const index = this.index;
    if (!index) return;
    const stride = index.height + pageGap;
    const top = this.scroll.scrollTop;
    const topSlot = Math.floor(top / stride);
    const firstVisible = topSlot + Number(top - topSlot * stride >= index.height);
    const lastVisible = Math.ceil((top + this.scroll.clientHeight) / stride) - 1;
    const first = Math.max(0, firstVisible - this.overscan);
    const last = Math.min(index.pages.length - 1, lastVisible + this.overscan);
    for (const [page, element] of this.mounted) {
      if (page < first || page > last) {
        element.remove();
        this.mounted.delete(page);
      }
    }
    for (let page = first; page <= last; page += 1) {
      if (this.mounted.has(page)) continue;
      const fragments = requireValue(index.pages[page], 'indexed page');
      const sheet = document.createElement('article');
      sheet.className = 'pm-page';
      sheet.dataset.page = String(page + 1);
      sheet.style.top = `${String(page * stride)}px`;
      sheet.setAttribute('aria-label', `Page ${String(page + 1)} of ${String(index.pages.length)}`);
      const body = pageContent();
      for (const fragment of fragments) {
        const node = requireValue(this.blocks[fragment.block], 'fragment source block');
        const whole = fragment.from === 0 && fragment.to === node.content.size;
        const element = renderBlock(
          whole ? node : node.copy(node.content.cut(fragment.from, fragment.to)),
        );
        element.dataset.sourceFrom = String(fragment.from);
        element.dataset.sourceTo = String(fragment.to);
        if (!whole && fragment.from > 0) element.dataset.pretextContinuation = '';
        if (!whole && fragment.to < node.content.size) element.dataset.pretextContinues = '';
        body.append(element);
      }
      sheet.append(body);
      const next = [...this.mounted]
        .filter(([number]) => number > page)
        .sort(([left], [right]) => left - right)[0];
      this.extent.insertBefore(sheet, next?.[1] ?? null);
      this.mounted.set(page, sheet);
    }
  }
}
