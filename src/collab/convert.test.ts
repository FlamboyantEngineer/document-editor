// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { headlessEditor, readFixture } from '../../test/collab-fixtures.js';
import { documentSchema as schema } from '../../test/document-markup.js';
import { repairElementIds } from '../engine/element-ids.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
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
