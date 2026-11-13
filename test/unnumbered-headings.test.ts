// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentOutline } from '../src/engine/outline.js';
import { referenceTargets } from '../src/engine/reference-targets.js';
import {
  BASE_TEMPLATE,
  catalogDocument,
  readDocumentFile,
  type StoredNode,
  writeDocumentFile,
} from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

const STYLESHEET = readFileSync(new URL('../labs/reference/document.css', import.meta.url), 'utf8');

const heading = (level: number, text: string, id: string, numbered = true): StoredNode => ({
  type: 'heading',
  attrs: { level, id, ...(numbered ? {} : { numbered: false }) },
  content: [{ type: 'text', text }],
});
const table = (caption: string): StoredNode => ({
  type: 'table',
  attrs: { caption },
  content: [
    { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] },
  ],
});

const stored = {
  formatVersion: 1 as const,
  sections: [
    {
      name: null,
      content: [
        heading(1, 'Scope', 'a0000001'),
        heading(2, 'Purpose', 'a0000002'),
        heading(1, 'Results', 'a0000003', false),
        heading(2, 'Detail', 'a0000004'),
        table('Values'),
        heading(1, 'Interfaces', 'a0000005'),
      ],
    },
  ],
};
const doc = readDocumentFile(stored, documentSchema).doc;

describe('unnumbered headings', () => {
  it('DOCE-SCHEMA-3.10 keeps whether a heading is numbered, stored only when it is not', () => {
    const written = writeDocumentFile(doc).sections[0]?.content ?? [];
    expect(written.map((node) => node.attrs?.numbered)).toEqual([
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
    ]);
    let results: ProseMirrorNode | undefined;
    doc.descendants((node) => {
      if (node.textContent === 'Results') results = node;
      return !results;
    });
    expect(results?.attrs.numbered).toBe(false);
    const rendered = results && documentSchema.nodes.heading?.spec.toDOM?.(results);
    expect(rendered).toEqual(['h1', expect.objectContaining({ 'data-numbered': 'false' }), 0]);
  });

  it('DOCE-SCHEMA-3.10 lists an unnumbered heading with no number and moves no counter', () => {
    const { toc, tables } = catalogDocument(doc, BASE_TEMPLATE);
    expect(toc?.map(({ number, text }) => `${number.trim()}|${text}`)).toEqual([
      '1.|Scope',
      '1.1.|Purpose',
      '|Results',
      '1.2.|Detail',
      '2.|Interfaces',
    ]);
    expect(tables?.map(({ number }) => number.trim())).toEqual(['Table 1.1']);
    const outline = documentOutline(EditorState.create({ doc }), BASE_TEMPLATE);
    expect(outline.map(({ number }) => number)).toEqual(['1.', '1.1.', '', '1.2.', '2.']);
    const target = referenceTargets(doc, BASE_TEMPLATE).find(({ id }) => id === 'a0000003');
    expect(target).toMatchObject({ number: '', label: 'Results' });
  });

  it('DOCE-SCHEMA-3.10 leaves an unnumbered heading uncounted in the reference stylesheet', () => {
    expect(STYLESHEET).toMatch(
      /:is\(h1, h2, h3, h4, h5, h6\)\[data-numbered='false'\] \{\s*counter-increment: none;\s*counter-set: none;/,
    );
    expect(STYLESHEET).toMatch(
      /:is\(h1, h2, h3, h4, h5, h6\)\[data-numbered='false'\]::before \{\s*content: none;/,
    );
  });
});
