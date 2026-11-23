// The verification path alone draws and measures an entire unpaginated HTML column.
import type { Node } from 'prosemirror-model';
import { requireValue } from './fixtures.js';
import { pageContent, renderBlock } from './html.js';
import { browserLines } from './natural-lines.js';
import { type Block, blockId } from './prediction.js';
import type { BlockReport, LayoutIndex } from './protocol.js';
import {
  type Boundary,
  divergence,
  referenceBoundaries,
  referencePages,
} from './reference-pages.js';

interface Difference {
  readonly path: string;
  readonly id: string;
  readonly metric: string;
  readonly predicted: number | number[];
  readonly html: number | number[];
}

function children(node: Node, element: HTMLElement, reports: readonly BlockReport[]) {
  if (node.type.name === 'table_figure') {
    const rows = element.querySelectorAll<HTMLElement>('tbody > tr');
    return reports.map((report, index) => ({
      node: requireValue(node.lastChild, 'table body').child(index),
      element: requireValue(rows[index], 'rendered row'),
      report,
    }));
  }
  if (node.type.name === 'code_figure') {
    return reports.map((report) => ({
      node: requireValue(node.lastChild, 'code block body'),
      element: requireValue(element.querySelector('pre'), 'rendered code body'),
      report,
    }));
  }
  return reports.map((report, index) => ({
    node: node.child(index),
    element: element.children[index] as HTMLElement,
    report,
  }));
}

// The oracle has one tolerance for CSS pixel measurements. Source offsets compare exactly.
const geometryTolerance = 0.5;

function compareDimension(
  differences: Difference[],
  path: string,
  id: string,
  metric: string,
  predicted: number,
  html: number,
) {
  if (Math.abs(predicted - html) > geometryTolerance)
    differences.push({ path, id, metric, predicted, html });
}

function measure(
  node: Node,
  element: HTMLElement,
  report: BlockReport,
  differences: Difference[],
): Block {
  const rect = element.getBoundingClientRect();
  const { marginTop, marginBottom } = getComputedStyle(element);
  const id = blockId(node) ?? node.type.name;
  function compare(metric: string, predicted: number | number[], html: number | number[]) {
    differences.push({ path: report.path, id, metric, predicted, html });
  }
  compareDimension(differences, report.path, id, 'height', report.height, rect.height);
  compareDimension(differences, report.path, id, 'width', report.width, rect.width);
  const actual = report.lines ? browserLines(node, element, rect) : undefined;
  if (actual && report.lines) {
    const html = actual.lines.map((line) => line.from);
    const predicted = report.lines.map((line) => line.from);
    if (html.length !== predicted.length) compare('line count', predicted.length, html.length);
    if (
      html.length !== predicted.length ||
      html.some((offset, index) => offset !== predicted[index])
    ) {
      compare('line offsets', predicted, html);
    }
  }
  const nested = report.children
    ? children(node, element, report.children).map((child) =>
        measure(child.node, child.element, child.report, differences),
      )
    : undefined;
  return {
    node,
    path: report.path,
    width: rect.width,
    height: rect.height,
    before: Number.parseFloat(marginTop),
    after: Number.parseFloat(marginBottom),
    ...actual,
    children: nested,
  };
}

export function verifyPages(
  sheets: HTMLElement,
  index: LayoutIndex,
  sources: readonly Node[],
  predictions: readonly BlockReport[],
  mountPage: (page: number) => void,
) {
  const overflow: number[] = [];
  const pageDifferences: Difference[] = [];
  let comparedFragments = 0;
  let comparedSplitLines = 0;
  index.pages.forEach((fragments, position) => {
    mountPage(position);
    const number = String(position + 1);
    const page = requireValue(
      sheets.querySelector<HTMLElement>(`[data-page="${number}"]`),
      `rendered page ${number}`,
    );
    const body = requireValue(
      page.querySelector<HTMLElement>('.pm-page-content'),
      'rendered page content',
    );
    if (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1) {
      overflow.push(position + 1);
    }
    const pageRect = page.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const path = `page ${number}`;
    compareDimension(pageDifferences, path, number, 'page width', index.width, pageRect.width);
    compareDimension(pageDifferences, path, number, 'page height', index.height, pageRect.height);
    compareDimension(
      pageDifferences,
      path,
      number,
      'body width',
      index.contentWidth,
      bodyRect.width,
    );
    compareDimension(
      pageDifferences,
      path,
      number,
      'body height',
      index.contentHeight,
      bodyRect.height,
    );
    if (body.children.length !== fragments.length)
      pageDifferences.push({
        path,
        id: number,
        metric: 'fragment count',
        predicted: fragments.length,
        html: body.children.length,
      });
    fragments.slice(0, body.childElementCount).forEach((fragment, at) => {
      const element = requireValue(body.children[at], 'rendered fragment');
      const rect = element.getBoundingClientRect();
      const source = requireValue(sources[fragment.block], 'fragment source block');
      const id = blockId(source) ?? String(fragment.block);
      if (fragment.from > 0 || fragment.to < source.content.size) {
        const lines = requireValue(predictions[fragment.block]?.lines, 'split paragraph lines');
        const cut = source.copy(source.content.cut(fragment.from, fragment.to));
        const rendered = browserLines(cut, element as HTMLElement, rect).lines.map(
          (line) => fragment.from + line.from,
        );
        const original = lines
          .map((line) => line.from)
          .filter((offset) => offset >= fragment.from && offset < fragment.to);
        if (
          rendered.length !== original.length ||
          rendered.some((offset, i) => offset !== original[i])
        )
          pageDifferences.push({
            path,
            id,
            metric: 'fragment line offsets',
            predicted: original,
            html: rendered,
          });
        comparedSplitLines += rendered.length;
      }
      compareDimension(pageDifferences, path, id, 'fragment width', fragment.width, rect.width);
      compareDimension(pageDifferences, path, id, 'fragment height', fragment.height, rect.height);
      compareDimension(
        pageDifferences,
        path,
        id,
        'fragment top',
        fragment.top,
        rect.top - bodyRect.top,
      );
      comparedFragments += 1;
    });
  });
  return {
    overflow,
    pageDifferences,
    comparedPages: index.pages.length,
    comparedFragments,
    comparedSplitLines,
  };
}

export function verify(
  host: HTMLElement,
  nodes: readonly Node[],
  measurements: readonly BlockReport[],
  index: LayoutIndex,
) {
  const column = pageContent();
  column.classList.add('pretext-oracle');
  const elements = nodes.map((node) => renderBlock(node));
  column.append(...elements);
  host.append(column);
  try {
    const differences: Difference[] = [];
    const blocks = nodes.map((node, position) =>
      measure(
        node,
        requireValue(elements[position], 'rendered block'),
        requireValue(measurements[position], 'block prediction'),
        differences,
      ),
    );
    // The page boundaries natural HTML gives, filled by the oracle's own packer.
    const htmlBoundaries = referenceBoundaries(referencePages(blocks, index.contentHeight));
    const predictedBoundaries = index.pages.map((page) =>
      page.map(({ block, from, to }): Boundary => [
        blockId(requireValue(nodes[block], 'fragment source block')) ?? String(block),
        from,
        to,
      ]),
    );
    const boundaryMismatches = Array.from(
      { length: Math.max(htmlBoundaries.length, predictedBoundaries.length) },
      (_, i) => i + 1,
    ).filter(
      (page) =>
        JSON.stringify(htmlBoundaries[page - 1]) !== JSON.stringify(predictedBoundaries[page - 1]),
    );
    return {
      differences,
      comparedBlocks: countBlocks(measurements),
      predictedPages: index.pages.length,
      htmlPages: htmlBoundaries.length,
      boundaryMismatches,
      firstDivergence: divergence(predictedBoundaries, htmlBoundaries, boundaryMismatches[0]),
      predictedBoundaries,
      htmlBoundaries,
    };
  } finally {
    column.remove();
  }
}

function countBlocks(blocks: readonly BlockReport[]): number {
  return blocks.reduce((sum, block) => sum + 1 + countBlocks(block.children ?? []), 0);
}
