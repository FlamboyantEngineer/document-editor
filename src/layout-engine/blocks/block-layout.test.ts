// @vitest-environment node
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import { readRegressionDocument, readRegressionTemplate } from '../../../test/stored-fixtures.js';
import {
  type ChildLayout,
  isContainerMeasurement,
  isTextMeasurement,
  type LayoutBlock,
  readDocumentFile,
} from '../../model/index.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { templatePageMetrics } from '../../model/templates/template-properties.js';
import { findTemplateSection } from '../../model/templates/template-sections.js';

const schema = createDocumentSchema();
const documents = join(dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/documents');
const names = readdirSync(documents)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length));

// What the engine leaves to the DOM for now, by node type.
const LEFT_TO_THE_DOM = new Set(['toc_block', 'linked_code_block', 'script_block']);

function expectChildrenInside(children: readonly ChildLayout[], height: number) {
  let previous = 0;
  for (const child of children) {
    expect(child.top).toBeGreaterThanOrEqual(previous - 1e-9);
    expect(child.bottom).toBeGreaterThanOrEqual(child.top);
    expect(child.bottom).toBeLessThanOrEqual(height + 1e-9);
    previous = child.top;
  }
}

function expectSound(block: LayoutBlock) {
  for (const value of [block.height, block.marginTop, block.marginBottom]) {
    expect(Number.isFinite(value) && value >= 0).toBe(true);
  }
  const { measurement } = block;
  if (isContainerMeasurement(measurement)) expectChildrenInside(measurement.children, block.height);
  if (isTextMeasurement(measurement)) {
    // A holder's measurement is its object's, so the range is the measured lines' own.
    const end = measurement.lines?.lines.at(-1)?.to ?? 0;
    expect(measurement.measure(0, end).lines).toBeGreaterThan(0);
  }
}

interface Section {
  readonly scope: string | null;
  readonly width: number;
  readonly blocks: ProseMirrorNode[];
}

function sectionsOf(name: string): {
  template: ReturnType<typeof readRegressionTemplate>;
  sections: Section[];
} {
  const file = readRegressionDocument(name);
  const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
  const { doc } = readDocumentFile(file, schema);
  const sections: Section[] = [];
  doc.forEach((section) => {
    const scope = typeof section.attrs.sectionName === 'string' ? section.attrs.sectionName : null;
    const page = templatePageMetrics(template, findTemplateSection(template, scope));
    const width = page.width - page.margins.left - page.margins.right;
    const blocks: ProseMirrorNode[] = [];
    section.descendants((node) => {
      if (node.type.name !== 'page_content') return true;
      node.forEach((block) => blocks.push(block));
      return false;
    });
    sections.push({ scope, width, blocks });
  });
  return { template, sections };
}

describe('block geometry over the regression set', () => {
  it('DOCE-PAGINATION-10.3 lays out every block of every regression document or names why not', () => {
    let laidOut = 0;
    const left = new Set<string>();
    for (const name of names) {
      const { template, sections } = sectionsOf(name);
      const { layout } = standInBlockLayout({ template });
      for (const { scope, width, blocks } of sections) {
        for (const block of blocks) {
          const result = layout.layoutBlock(block, { width, scope });
          if (result.ok) {
            expectSound(result.block);
            laidOut += 1;
          } else {
            expect(result.reason, `${name}: ${block.type.name}`).not.toBe('');
            left.add(result.node.type.name);
          }
        }
      }
    }
    expect(laidOut).toBeGreaterThan(800);
    expect([...left].filter((type) => !LEFT_TO_THE_DOM.has(type))).toEqual([]);
  });

  it('DOCE-PAGINATION-10.3 gives a block the same geometry each time it is laid out', () => {
    const { template, sections } = sectionsOf('long-mixed');
    const first = standInBlockLayout({ template }).layout;
    const second = standInBlockLayout({ template }).layout;
    for (const { scope, width, blocks } of sections) {
      for (const block of blocks) {
        const a = first.layoutBlock(block, { width, scope });
        const b = second.layoutBlock(block, { width, scope });
        expect(JSON.stringify(a.ok && { ...a.block, node: null })).toBe(
          JSON.stringify(b.ok && { ...b.block, node: null }),
        );
      }
    }
  });
});
