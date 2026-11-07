import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup, roundTrip, writeMarkup } from '../../../test/document-markup.js';
import { createDocumentSchema, DOCUMENT_MARK_ORDER, DOCUMENT_NODE_ORDER } from '../index.js';

/** A host's own block, at a free ordinal before the page section. */
const noteExtension: RichTextExtension = {
  name: 'note',
  nodes: [
    {
      name: 'note_block',
      order: 20,
      spec: {
        group: 'block',
        atom: true,
        attrs: { tone: { default: 'info' } },
        parseDOM: [
          {
            tag: 'aside[data-note]',
            getAttrs: (dom: HTMLElement) => ({ tone: dom.getAttribute('data-note') }),
          },
        ],
        toDOM: (node) => ['aside', { 'data-note': String(node.attrs.tone) }],
      },
    },
  ],
};

/** A host's refinement of the built-in table, which adds an attribute of its own. */
const sourceExtension: RichTextExtension = {
  name: 'table-source',
  refineNode: (name, spec) =>
    name === 'table' ? { ...spec, attrs: { ...spec.attrs, source: { default: '' } } } : spec,
};

describe('createDocumentSchema', () => {
  it('DOCE-SCHEMA-1.1 builds every built-in node and mark type in the documented order', () => {
    const schema = createDocumentSchema();
    expect(Object.keys(schema.nodes)).toEqual(
      Object.entries(DOCUMENT_NODE_ORDER)
        .sort(([, a], [, b]) => a - b)
        .map(([name]) => name),
    );
    expect(Object.keys(schema.marks)).toEqual(Object.keys(DOCUMENT_MARK_ORDER));
    expect(schema.topNodeType.name).toBe('doc');
  });

  it('DOCE-SCHEMA-1.2 places a host type at its free ordinal and reads its markup', () => {
    const schema = createDocumentSchema({ extensions: [noteExtension] });
    const names = Object.keys(schema.nodes);
    expect(names.indexOf('note_block')).toBe(names.indexOf('dynamic_template') + 1);
    expect(names.indexOf('page_section')).toBe(names.indexOf('note_block') + 1);
    expect(roundTrip('<aside data-note="warning"></aside>', { extensions: [noteExtension] })).toBe(
      '<aside data-note="warning"></aside>',
    );
  });

  it('DOCE-SCHEMA-1.3 gives a host type the element attributes and lets a host refine a built-in type', () => {
    const schema = createDocumentSchema({ extensions: [noteExtension, sourceExtension] });
    expect(schema.nodes.note_block?.spec.attrs).toHaveProperty('dataId');
    expect(schema.nodes.table?.spec.attrs).toHaveProperty('dataId');
    expect(schema.nodes.table?.spec.attrs).toHaveProperty('source');
    const doc = parseMarkup('<aside data-note="info" data-id="n1"></aside>', schema);
    expect(findNode(doc, 'note_block')?.attrs.dataId).toBe('n1');
    expect(writeMarkup(doc, schema)).toBe('<aside data-note="info" data-id="n1"></aside>');
  });

  it('DOCE-SCHEMA-1.4 writes tooltips to the attribute the host names and reads it back', () => {
    const options = { schema: { tooltipAttribute: 'data-tip' } };
    expect(
      roundTrip('<p><a href="https://example.com" title="Example">site</a></p>', options),
    ).toBe('<p><a href="https://example.com" data-tip="Example">site</a></p>');
    expect(roundTrip('<p><a href="https://example.com">site</a></p>')).toBe(
      '<p><a href="https://example.com">site</a></p>',
    );
  });

  it('DOCE-SCHEMA-1.4 renders mentions with the class the host names', () => {
    const html = '<p><span data-mention-user-id="u1" data-mention-label="Ada">@Ada</span></p>';
    expect(roundTrip(html)).toContain('class="de-mention"');
    expect(roundTrip(html, { schema: { mentionClass: 'host-mention' } })).toContain(
      'class="host-mention"',
    );
  });
});
