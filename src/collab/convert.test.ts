// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { headlessEditor, readFixture } from '../../test/collab-fixtures.js';
import { documentSchema as schema } from '../../test/document-markup.js';
import { createDocumentSections, documentSectionsKey } from '../engine/document-sections.js';
import { repairElementIds } from '../engine/element-ids.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import {
  COMMENTS_TYPE,
  documentToYjs,
  META_TYPE,
  readRoomDocument,
  updateRoomDocument,
  writeRoomDocument,
  yjsToDocument,
} from './convert.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../test/fixtures/documents');
const documents = readdirSync(fixtures)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    name: file.slice(0, -'.json'.length),
    file: JSON.parse(readFileSync(join(fixtures, file), 'utf8')) as DocumentFile,
  }));

// The stored document as the editor opens it: an element without its own id given one
// (`repairElementIds`), with ids made by `newId`.
function asOpened(file: DocumentFile, newId: () => string): DocumentFile {
  const { doc } = readDocumentFile(file, schema);
  const repair = repairElementIds(EditorState.create({ doc }), { newId });
  return repair ? writeDocumentFile(repair.doc, { template: file.template ?? null }) : file;
}

const sequence = () => {
  let next = 0;
  return () => `ffff${(next++).toString(16).padStart(4, '0')}`;
};

const paragraph = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});
const small = (content: unknown[]): DocumentFile =>
  ({
    formatVersion: 1,
    template: { id: 'report', revision: '3' },
    sections: [{ name: null, content }],
  }) as DocumentFile;

describe('room conversion', () => {
  it('DOCE-COLLAB-6.2 converts without DOM globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it.each(documents)(
    'DOCE-COLLAB-6.2 round-trips the regression document $name through a room',
    ({ file }) => {
      const read = yjsToDocument(documentToYjs(file, { schema, newId: sequence() }), { schema });
      // Elements the editor gives an id when it opens the document (inline atoms, the paragraph
      // of an empty section) take theirs in the seed; every other document comes back unchanged.
      expect(read).toEqual(asOpened(file, sequence()));
    },
  );

  it('DOCE-COLLAB-6.2 DOCE-EMBEDS-1.4 keeps every attribute of an inline embed through a room, twice', () => {
    const file = small([
      {
        type: 'paragraph',
        attrs: { id: 'a0000001' },
        content: [
          { type: 'text', text: 'Total ' },
          {
            type: 'embed_inline',
            attrs: {
              id: 'e0000001',
              kind: 'cell',
              source: 'book!B2',
              snapshot: 'r1',
              label: 'B2',
              pinned: true,
              text: '42',
            },
          },
        ],
      },
    ]);
    const once = yjsToDocument(documentToYjs(file, { schema, newId: sequence() }), { schema });
    if (!once) throw new Error('The room holds the document');
    const twice = yjsToDocument(documentToYjs(once, { schema, newId: sequence() }), { schema });
    expect(once).toEqual(file);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('DOCE-COLLAB-6.2 keeps every attribute of a citation, an abbreviation and an embed through a room, twice', () => {
    const { doc } = readDocumentFile(
      small([
        paragraph('a0000001', 'See PWR-100 and GSE.'),
        {
          type: 'embed',
          attrs: { id: 'a0000002', kind: 'record', source: 'r-1', snapshot: 's-2', label: 'Rig' },
          content: [paragraph('a0000003', 'Held.')],
        },
      ]),
      schema,
    );
    const { reference } = schema.marks;
    const { abbreviation_reference: abbreviation } = schema.nodes;
    if (!reference || !abbreviation) throw new Error('The schema has references and abbreviations');
    const cited = reference.create({
      refType: 'catalogue-entry',
      targetId: 'doc-7',
      subTarget: 'clause-4',
      includeRevision: true,
      referenceBaseline: JSON.stringify({ version: 1, documentId: 'doc-7', numbering: 'PWR-100' }),
      libraryRevisionId: 'pwr-100@B',
      libraryLabel: 'PWR-100 Rev B',
      docPublisher: 'Standards office',
      docNumber: 'PWR-100',
      docRevision: 'Rev B',
      docTitle: 'Power interface',
      docAuthors: 'A. Writer',
      docPages: '4-7',
    });
    let at = -1;
    doc.descendants((node, pos) => {
      if (at < 0 && node.isText) at = pos + (node.text?.indexOf('PWR-100') ?? 0);
      return at < 0;
    });
    const marked = EditorState.create({ doc })
      .tr.addMark(at, at + 'PWR-100'.length, cited)
      .replaceWith(
        at + 'PWR-100 and '.length,
        at + 'PWR-100 and GSE'.length,
        abbreviation.create({
          entryId: 'glossary-gse',
          display: 'short',
          abbr: 'GSE',
          expansion: 'Ground support equipment',
        }),
      );
    const file = writeDocumentFile(marked.doc, { template: { id: 'report', revision: '3' } });
    const once = yjsToDocument(documentToYjs(file, { schema, newId: sequence() }), { schema });
    if (!once) throw new Error('The room holds the document');
    const twice = yjsToDocument(documentToYjs(once, { schema, newId: sequence() }), { schema });
    // The inline atom takes its id in the seed, as the editor gives it one on opening.
    expect(once).toEqual(asOpened(file, sequence()));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(JSON.stringify(once)).toContain('"text":"PWR-100","marks"');
    expect(JSON.stringify(once)).toContain('"targetRevision":"pwr-100@B"');
  });

  it('DOCE-COLLAB-6.2 gives an element without an id one in the seed', () => {
    let next = 0;
    const newId = () => `0000000${String(++next)}`;
    const read = yjsToDocument(
      documentToYjs(small([{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }]), {
        schema,
        newId,
      }),
      { schema },
    );
    expect(read?.sections[0]?.content).toEqual([paragraph('00000001', 'A')]);
  });

  it('DOCE-COLLAB-6.2 keeps the template pin and format version in meta', () => {
    const file = small([paragraph('a0000001', 'Alpha')]);
    const doc = new Y.Doc();
    writeRoomDocument(doc, file, { schema });
    expect(doc.get(META_TYPE).getAttrs()).toEqual({
      formatVersion: 1,
      template: { id: 'report', revision: '3' },
    });
    expect(doc.get(COMMENTS_TYPE).getAttrs()).toEqual({});
    expect(readRoomDocument(doc, { schema })).toEqual(file);
  });

  it('DOCE-COLLAB-6.2 reads a room changed after its seed', () => {
    const doc = new Y.Doc();
    writeRoomDocument(doc, small([paragraph('a0000001', 'Alpha')]), { schema });
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    other.get(META_TYPE).setAttr('template', null);
    const read = yjsToDocument(Y.encodeStateAsUpdate(other), { schema });
    expect(read?.template).toBeNull();
    expect(read?.sections).toEqual(small([paragraph('a0000001', 'Alpha')]).sections);
  });

  it('DOCE-COLLAB-6.2 refuses to seed a room that holds a document', () => {
    const doc = new Y.Doc();
    const file = small([paragraph('a0000001', 'Alpha')]);
    writeRoomDocument(doc, file, { schema });
    expect(() => writeRoomDocument(doc, file, { schema })).toThrow(/already holds/);
  });

  it('DOCE-COLLAB-6.2 refuses a room of another format version', () => {
    const doc = new Y.Doc();
    writeRoomDocument(doc, small([paragraph('a0000001', 'Alpha')]), { schema });
    doc.get(META_TYPE).setAttr('formatVersion', 2);
    expect(() => readRoomDocument(doc, { schema })).toThrow(/format version 2/);
  });

  it('DOCE-COLLAB-6.2 reads an empty room as no document', () => {
    expect(yjsToDocument(Y.encodeStateAsUpdate(new Y.Doc()), { schema })).toBeNull();
  });
});

describe('room updates', () => {
  const three = small([
    paragraph('a0000001', 'Alpha'),
    paragraph('a0000002', 'Beta'),
    paragraph('a0000003', 'Gamma'),
  ]);
  const changed = small([
    paragraph('a0000001', 'Alpha, changed'),
    paragraph('a0000002', 'Beta'),
    paragraph('a0000003', 'Gamma'),
  ]);

  function seeded(file: DocumentFile): Y.Doc {
    const doc = new Y.Doc();
    writeRoomDocument(doc, file, { schema });
    return doc;
  }

  const peerOf = (doc: Y.Doc): Y.Doc => {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    return peer;
  };

  // The text type of the paragraph at `index` in the room's first page.
  const paragraphAt = (doc: Y.Doc, index: number): Y.Type => {
    let type: Y.Type = doc.get('content');
    for (const step of [0, 0, 1, index]) type = type.get(step) as Y.Type;
    return type;
  };

  it('DOCE-COLLAB-6.5 writes only what changed, as one transaction under its origin', () => {
    const doc = seeded(three);
    const position = Y.createRelativePositionFromTypeIndex(paragraphAt(doc, 2), 3);
    const origins: unknown[] = [];
    doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin));
    updateRoomDocument(doc, changed, { schema, origin: 'server' });
    expect(origins).toEqual(['server']);
    expect(readRoomDocument(doc, { schema })).toEqual(changed);
    // The paragraphs it did not change are the same shared types, so places in them hold.
    const absolute = Y.createAbsolutePositionFromRelativePosition(position, doc);
    expect(absolute?.type).toBe(paragraphAt(doc, 2));
    expect(absolute?.index).toBe(3);
  });

  it('DOCE-COLLAB-6.5 reaches an editor in the room as one change', () => {
    const doc = seeded(three);
    const editor = headlessEditor(readFixture(three), { doc, manual: true });
    editor.runScheduled();
    const before = editor.dispatched.length;
    updateRoomDocument(doc, changed, { schema, origin: 'server' });
    editor.runScheduled();
    expect(editor.dispatched.length).toBe(before + 1);
    expect(writeDocumentFile(editor.state.doc, { template: changed.template ?? null })).toEqual(
      changed,
    );
    editor.destroy();
  });

  it('DOCE-COLLAB-6.5 keeps the page headers and footers the writers set, while their settings hold', () => {
    const doc = seeded(three);
    const editor = headlessEditor(readFixture(three), { doc, manual: true });
    editor.runScheduled();
    // A writer's editor sets its regions read-only, as the template's regions are drawn.
    const tr = editor.state.tr;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'page_header' || node.type.name === 'page_footer')
        tr.setNodeAttribute(pos, 'editable', false);
      return node.type.name !== 'page_content';
    });
    editor.dispatch(tr);
    editor.runScheduled();
    updateRoomDocument(doc, changed, { schema, origin: 'server' });
    editor.runScheduled();
    const regions: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'page_header' || node.type.name === 'page_footer')
        regions.push(node.attrs.editable);
      return node.type.name !== 'page_content';
    });
    expect(regions).toEqual([false, false]);
    expect(readRoomDocument(doc, { schema })).toEqual(changed);
    editor.destroy();
  });

  describe('page headers after a server write', () => {
    const plain = (value: string) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: value }],
    });
    const named: TemplateFile = {
      ...BASE_TEMPLATE,
      id: 'report',
      header: { content: [plain('Main')] },
      sections: [{ name: 'annex', header: { content: [plain('Annex')] } }],
    };
    const other: TemplateFile = { ...named, header: { content: [plain('Other')] } };
    const section = (name: string | null, id: string) => ({
      name,
      content: [paragraph(id, `Text ${id}`)],
    });
    const file = (sections: unknown[], revision = '3'): DocumentFile =>
      ({ formatVersion: 1, template: { id: 'report', revision }, sections }) as DocumentFile;
    const two = file([section(null, 'b0000001'), section('annex', 'b0000002')]);

    // A writer in the room whose editor sets its headers and footers from the template.
    function writer(start: DocumentFile, template: () => TemplateFile) {
      const doc = seeded(start);
      const editor = headlessEditor(readFixture(start), {
        doc,
        manual: true,
        plugins: [createDocumentSections({ template })],
      });
      editor.runScheduled();
      editor.dispatch(editor.state.tr.setMeta(documentSectionsKey, true));
      editor.runScheduled();
      return { doc, editor };
    }
    const headers = (state: EditorState) => {
      const found: [string, unknown][] = [];
      state.doc.descendants((node) => {
        if (node.type.name === 'page_header') found.push([node.textContent, node.attrs.editable]);
        return node.type.name !== 'page_content';
      });
      return found;
    };

    it('DOCE-COLLAB-6.5 takes a renamed section’s header from the template', () => {
      const { doc, editor } = writer(two, () => named);
      expect(headers(editor.state)).toEqual([
        ['Main', false],
        ['Annex', false],
      ]);
      const renamed = file([section('annex', 'b0000001'), section(null, 'b0000002')]);
      updateRoomDocument(doc, renamed, { schema, origin: 'server', pageTemplate: named });
      editor.runScheduled();
      expect(headers(editor.state)).toEqual([
        ['Annex', false],
        ['Main', false],
      ]);
      expect(readRoomDocument(doc, { schema })).toEqual(renamed);
      editor.destroy();
    });

    it('DOCE-COLLAB-6.5 takes the headers from the template when sections are added or moved', () => {
      const { doc, editor } = writer(two, () => named);
      const added = file([
        section('annex', 'b0000003'),
        section(null, 'b0000001'),
        section('annex', 'b0000002'),
      ]);
      updateRoomDocument(doc, added, { schema, origin: 'server', pageTemplate: named });
      editor.runScheduled();
      expect(headers(editor.state)).toEqual([
        ['Annex', false],
        ['Main', false],
        ['Annex', false],
      ]);
      editor.destroy();
    });

    it('DOCE-COLLAB-6.5 takes the headers from a template the write changes to', () => {
      let template = named;
      const { doc, editor } = writer(two, () => template);
      template = other;
      updateRoomDocument(doc, file(two.sections, '4'), {
        schema,
        origin: 'server',
        pageTemplate: other,
      });
      editor.runScheduled();
      expect(headers(editor.state)).toEqual([
        ['Other', false],
        ['Annex', false],
      ]);
      editor.destroy();
    });

    it('DOCE-COLLAB-6.5 does not use a template its pin does not name', () => {
      const { doc, editor } = writer(two, () => named);
      const renamed = file([section('annex', 'b0000001'), section(null, 'b0000002')]);
      updateRoomDocument(doc, renamed, {
        schema,
        origin: 'server',
        pageTemplate: { ...named, id: 'memo' },
      });
      editor.runScheduled();
      expect(headers(editor.state).map(([value]) => value)).not.toContain('Annex');
      editor.destroy();
    });

    it('DOCE-COLLAB-6.5 without the template, leaves a changed section’s regions as stored', () => {
      const { doc, editor } = writer(two, () => named);
      const renamed = file([section('annex', 'b0000001'), section(null, 'b0000002')]);
      updateRoomDocument(doc, renamed, { schema, origin: 'server' });
      editor.runScheduled();
      expect(headers(editor.state).map(([value]) => value)).not.toContain('Main');
      editor.destroy();
    });
  });

  it('DOCE-COLLAB-6.5 keeps a writer’s concurrent change in another block', () => {
    const doc = seeded(three);
    const peer = peerOf(doc);
    paragraphAt(peer, 1).insert(4, '!');
    updateRoomDocument(doc, changed, { schema });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    const read = readRoomDocument(doc, { schema });
    expect(read?.sections[0]?.content).toEqual([
      paragraph('a0000001', 'Alpha, changed'),
      paragraph('a0000002', 'Beta!'),
      paragraph('a0000003', 'Gamma'),
    ]);
    expect(readRoomDocument(peer, { schema })).toEqual(read);
  });

  it('DOCE-COLLAB-6.5 writes nothing for an unchanged document and updates the pin alone', () => {
    const doc = seeded(three);
    let updates = 0;
    doc.on('update', () => (updates += 1));
    updateRoomDocument(doc, three, { schema });
    expect(updates).toBe(0);
    updateRoomDocument(doc, { ...three, template: null }, { schema });
    expect(updates).toBe(1);
    expect(doc.get(META_TYPE).getAttr('template')).toBeNull();
  });

  it('DOCE-COLLAB-6.5 writes the whole document into a room that holds none', () => {
    const doc = new Y.Doc();
    updateRoomDocument(doc, three, { schema });
    expect(readRoomDocument(doc, { schema })).toEqual(three);
  });

  it('DOCE-COLLAB-6.5 refuses a room of another format version', () => {
    const doc = seeded(three);
    doc.get(META_TYPE).setAttr('formatVersion', 2);
    expect(() => updateRoomDocument(doc, changed, { schema })).toThrow(/format version 2/);
  });
});
