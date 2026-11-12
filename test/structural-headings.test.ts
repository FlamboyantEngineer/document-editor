// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isStructuralHeading, readDocumentFile, type StoredNode } from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

const STYLESHEET = readFileSync(new URL('../labs/reference/document.css', import.meta.url), 'utf8');

const heading: StoredNode = {
  type: 'heading',
  attrs: { level: 1 },
  content: [{ type: 'text', text: 'H' }],
};

// Each container that sets a heading as text, the element it renders as and a document holding
// a heading in it.
const CONTAINERS: readonly (readonly [string, StoredNode])[] = [
  [
    'li',
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }, heading] }],
    },
  ],
  [
    'td',
    {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [heading] }] }],
    },
  ],
  [
    'th',
    {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [heading] }] }],
    },
  ],
  ['blockquote', { type: 'blockquote', content: [heading] }],
];

function headingIn(container: StoredNode): boolean {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [container] }] },
    documentSchema,
  ).doc;
  let structural: boolean | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') structural = isStructuralHeading(doc, pos);
  });
  return structural ?? true;
}

// The containers the stylesheet's rule for uncounted headings names.
function uncountedContainers(): string[] {
  const rule =
    /:is\(([^)]*)\)\s*:is\(h1, h2, h3, h4, h5, h6\)\s*\{\s*counter-increment: none;/.exec(
      STYLESHEET,
    );
  return (rule?.[1] ?? '').split(',').map((each) => each.trim());
}

describe('structural headings in the reference stylesheet', () => {
  it('DOCE-CONTENTS-1.1 leaves uncounted the headings the catalog does not number', () => {
    expect(CONTAINERS.map(([, container]) => headingIn(container))).toEqual(
      CONTAINERS.map(() => false),
    );
    expect(uncountedContainers().sort()).toEqual(CONTAINERS.map(([tag]) => tag).sort());
    expect(STYLESHEET).toMatch(/h1\[data-doc-title='true'\] \{\s*counter-increment: none;/);
  });
});
