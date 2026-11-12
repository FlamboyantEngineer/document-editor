import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../../test/document-markup.js';
import {
  documentRegions,
  documentSections,
  isSectionNode,
  isStructureNode,
  regionAt,
  regionBeside,
  regionKind,
  sectionAt,
  sectionRegions,
} from './document-structure.js';

const region = (name: string, inner = '') =>
  `<div class="pm-${name}" data-pm-${name}="true">${inner}</div>`;

const page = (content: string, notes = '') =>
  `<div class="pm-page" data-pm-page="true">${region('page-header', '<p>Head</p>')}${region('page-content', content)}${region('page-footnotes', notes)}${region('page-footer', '<p>Foot</p>')}</div>`;

const section = (name: string, ...pages: string[]) =>
  `<div class="pm-section" data-pm-section="true" data-section-name="${name}">${pages.join('')}</div>`;

// Two sections, the first on two pages.
const paged = () =>
  parseMarkup(
    section('Intro', page('<p>One</p>'), page('<p>Two</p>')) +
      section('Main', page('<p>Three</p>')),
  );

// The canonical shape of the same document: each section holds its regions with no page node.
function canonical(doc: ProseMirrorNode): ProseMirrorNode {
  const sections: ProseMirrorNode[] = [];
  doc.forEach((sectionNode) => {
    const pages: ProseMirrorNode[] = [];
    sectionNode.forEach((pageNode) => pages.push(pageNode));
    const [first] = pages;
    const regions: ProseMirrorNode[] = [];
    first?.forEach((node, _offset, index) => {
      const content = index === 1 ? pages.flatMap((p) => p.child(1).content.content) : null;
      regions.push(content ? node.type.create(node.attrs, content) : node);
    });
    sections.push(sectionNode.type.create(sectionNode.attrs, regions));
  });
  return documentSchema.topNodeType.create(null, sections);
}

const textPos = (doc: ProseMirrorNode, text: string) => {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === text) found = pos;
  });
  return found;
};

describe('document structure', () => {
  it('DOCE-SCHEMA-6.1 lists the sections and tells structure from content', () => {
    for (const doc of [paged(), canonical(paged())]) {
      const sections = documentSections(doc);
      expect(sections.map((s) => [s.index, s.name])).toEqual([
        [0, 'Intro'],
        [1, 'Main'],
      ]);
      expect(sections.every((s) => doc.nodeAt(s.pos) === s.node && isSectionNode(s.node))).toBe(
        true,
      );
    }
    const doc = paged();
    const kinds = new Set<string>();
    doc.descendants((node) => {
      if (isStructureNode(node)) kinds.add(node.type.name);
    });
    expect([...kinds].sort()).toEqual(
      [
        'page',
        'page_content',
        'page_footer',
        'page_footnotes',
        'page_header',
        'page_section',
      ].sort(),
    );
    expect(regionKind(doc.firstChild?.firstChild?.child(2) ?? doc)).toBe('footnotes');
  });

  it('DOCE-SCHEMA-6.2 lists the regions of every page of a paged document, once each in the canonical one', () => {
    const contents = (doc: ProseMirrorNode) =>
      documentRegions(doc, new Set(['content'])).map((r) => [r.section.name, r.node.textContent]);
    const doc = paged();
    expect(contents(doc)).toEqual([
      ['Intro', 'One'],
      ['Intro', 'Two'],
      ['Main', 'Three'],
    ]);
    expect(contents(canonical(doc))).toEqual([
      ['Intro', 'OneTwo'],
      ['Main', 'Three'],
    ]);
    for (const shape of [doc, canonical(doc)]) {
      const regions = documentRegions(shape);
      expect(regions.every((r) => shape.nodeAt(r.pos) === r.node)).toBe(true);
      const [first] = documentSections(shape);
      expect(
        first &&
          sectionRegions(first)
            .map((r) => r.kind)
            .slice(0, 4),
      ).toEqual(['header', 'content', 'footnotes', 'footer']);
    }
  });

  it('DOCE-SCHEMA-6.3 finds the region and section holding a position', () => {
    for (const doc of [paged(), canonical(paged())]) {
      const at = regionAt(doc.resolve(textPos(doc, 'Three') + 1));
      expect(at?.kind).toBe('content');
      expect(at?.section.name).toBe('Main');
      expect(at?.section.index).toBe(1);
      expect(at && doc.nodeAt(at.pos)).toBe(at?.node);
      expect(at && doc.resolve(textPos(doc, 'Three')).node(at.depth)).toBe(at?.node);
      expect(regionAt(doc.resolve(textPos(doc, 'Head') + 1))?.kind).toBe('header');
      expect(regionAt(doc.resolve(0))).toBeNull();
      expect(sectionAt(doc.resolve(1))?.name).toBe('Intro');
      expect(sectionAt(doc.resolve(0))).toBeNull();
    }
  });

  it('DOCE-SCHEMA-6.3 finds the region of a kind beside a position', () => {
    const doc = paged();
    const notes = regionBeside(doc.resolve(textPos(doc, 'Two') + 1), 'footnotes');
    expect(notes && doc.nodeAt(notes.pos)).toBe(notes?.node);
    const [, second] = documentRegions(doc, new Set(['footnotes']));
    expect(notes?.pos).toBe(second?.pos);
    const whole = canonical(doc);
    const beside = regionBeside(whole.resolve(textPos(whole, 'Three') + 1), 'footer');
    expect(beside?.node.textContent).toBe('Foot');
    expect(beside?.section.name).toBe('Main');
    expect(regionBeside(doc.resolve(1), 'footnotes')).toBeNull();
    expect(regionBeside(doc.resolve(0), 'footnotes')).toBeNull();
  });
});
