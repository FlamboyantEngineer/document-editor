import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  BASE_TEMPLATE,
  catalogDocument,
  createDocumentSchema,
  readDocumentFile,
  type StoredNode,
  writeDocumentFile,
} from '../model/index.js';
import { proofedBlocks } from './proofing-text.js';
import { createSearch, searchState, setSearch } from './search.js';

// The recipe for a host's own domain nodes, in generic terms: a refinement of a built-in type that
// keeps a snapshot of where its content came from, and an inline atom that shows a value as text.
// Each is stored under the names its extension gives it, so those names are the host's contract.

/** A table refined to keep the snapshot of the data set it was filled from. */
const snapshotTables: RichTextExtension = {
  name: 'snapshot-tables',
  refineNode: (name, spec) =>
    name !== 'table'
      ? spec
      : {
          ...spec,
          attrs: { ...spec.attrs, sourceId: { default: null }, sourceSnapshot: { default: null } },
        },
};

/** An inline atom showing one value of an enumerated set, as its label. */
const enumValues: RichTextExtension = {
  name: 'enum-values',
  nodes: [
    {
      name: 'enum_value',
      order: 390,
      spec: {
        group: 'inline',
        inline: true,
        atom: true,
        attrs: { set: { default: '' }, value: { default: '' }, label: { default: '' } },
        leafText: (node) => String(node.attrs.label),
        parseDOM: [
          {
            tag: 'span[data-enum-value]',
            getAttrs: (dom: HTMLElement) => ({
              set: dom.getAttribute('data-enum-set') ?? '',
              value: dom.getAttribute('data-enum-value') ?? '',
              label: dom.textContent ?? '',
            }),
          },
        ],
        toDOM: (node) => [
          'span',
          { 'data-enum-set': String(node.attrs.set), 'data-enum-value': String(node.attrs.value) },
          String(node.attrs.label),
        ],
      },
    },
  ],
};

const schema = createDocumentSchema({ extensions: [snapshotTables, enumValues] });

const status = (label: string): StoredNode => ({
  type: 'enum_value',
  attrs: { set: 'status', value: label.toLowerCase(), label },
});
const text = (value: string): StoredNode => ({ type: 'text', text: value });

const STORED: StoredNode[] = [
  { type: 'heading', content: [text('Status: '), status('Approved')] },
  { type: 'paragraph', content: [text('The pump is '), status('Approved'), text(' today.')] },
  {
    type: 'table',
    attrs: { sourceId: 'set-7', sourceSnapshot: 'snap-3' },
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [status('Draft')] }] },
        ],
      },
    ],
  },
];

const read = (): Node =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content: STORED }] }, schema).doc;

describe('host domain nodes', () => {
  it('DOCE-SCHEMA-1.3 stores a refined table and an inline atom under their extension names', () => {
    const doc = read();
    expect(writeDocumentFile(doc).sections[0]?.content).toEqual(STORED);
    let table: Node | undefined;
    doc.descendants((node) => {
      if (node.type.name === 'table') table = node;
      return !table;
    });
    expect(table?.attrs).toMatchObject({ sourceId: 'set-7', sourceSnapshot: 'snap-3' });
  });

  it('DOCE-SCHEMA-1.3 reads an inline atom as its text in search, proofing and the catalog', () => {
    const doc = read();
    const state = EditorState.create({ doc, plugins: [createSearch()] });
    let searched = state;
    setSearch('approved')(state, (tr) => (searched = state.apply(tr)));
    const matches = searchState(searched)?.matches ?? [];
    expect(matches).toHaveLength(2);
    expect(
      matches.map(({ from, to }) => doc.nodeAt(from)?.type.name === 'enum_value' && to - from),
    ).toEqual([1, 1]);
    expect(proofedBlocks(doc).map((block) => block.text)).toEqual([
      'Status: Approved',
      'The pump is Approved today.',
      'Draft',
    ]);
    expect(catalogDocument(doc, BASE_TEMPLATE).toc?.map((entry) => entry.text)).toEqual([
      'Status: Approved',
    ]);
  });
});
