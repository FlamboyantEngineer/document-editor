// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  type DocumentFile,
  readDocumentFile,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
  type StoredNode,
  writeDocumentFile,
} from '../index.js';
import { storedAttrName, type StoredTypeMapping } from './document-format.js';

// The stored-format golden files (DOCE-FORMAT-7.2): one committed stored document per node type,
// and one for the marks, each with every stored attribute set away from its default. They lock the
// stored names, so a change to them fails here until the files and the spec change with it.

const FIXTURES = new URL('../../../test/fixtures/format/', import.meta.url);

const fixtures = readdirSync(FIXTURES)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => ({
    name,
    file: JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as DocumentFile,
  }));

/** Every stored node in the golden files, and the marks on their text. */
function storedNodes(): StoredNode[] {
  const nodes: StoredNode[] = [];
  const walk = (node: StoredNode) => {
    nodes.push(node);
    node.content?.forEach(walk);
  };
  for (const { file } of fixtures)
    file.sections.forEach((section) => section.content.forEach(walk));
  return nodes;
}

/** The stored attribute names a schema type writes. */
function storedAttrNames(
  attrs: Readonly<Record<string, unknown>> | undefined,
  mapping: StoredTypeMapping,
): string[] {
  return Object.keys(attrs ?? {})
    .map((name) => storedAttrName(mapping, name))
    .filter((name): name is string => name !== null);
}

/** The stored attribute names the golden files carry, by stored type. */
function attrsInFixtures(entries: readonly { type: string; attrs?: object | undefined }[]) {
  const found = new Map<string, Set<string>>();
  for (const { type, attrs } of entries) {
    const names = found.get(type) ?? new Set<string>();
    Object.keys(attrs ?? {}).forEach((name) => names.add(name));
    found.set(type, names);
  }
  return found;
}

describe('stored-format golden files', () => {
  it.each(fixtures)(
    'DOCE-FORMAT-7.2 reads $name and writes it back unchanged',
    ({ file }: { file: DocumentFile }) => {
      const doc = readDocumentFile(file, documentSchema);
      expect(writeDocumentFile(doc, { template: file.template ?? null })).toEqual(file);
    },
  );

  it('DOCE-FORMAT-7.2 has a golden file for every stored node type with each stored attribute set', () => {
    const nodes = storedNodes();
    const found = attrsInFixtures(nodes);
    for (const [name, mapping] of Object.entries(STORED_NODE_TYPES)) {
      expect(found.has(mapping.type), `no golden file holds ${mapping.type}`).toBe(true);
      if (name === 'text') continue;
      const expected = storedAttrNames(documentSchema.nodes[name]?.spec.attrs, mapping);
      // Math stores its text as `source`, which no schema attribute names.
      if (name === 'math_inline' || name === 'math_display') expected.push('source');
      expect([...(found.get(mapping.type) ?? [])].sort(), mapping.type).toEqual(expected.sort());
    }
  });

  it('DOCE-FORMAT-7.2 has every stored mark type with each stored attribute set', () => {
    const marks = storedNodes().flatMap((node) => node.marks ?? []);
    const found = attrsInFixtures(marks);
    for (const [name, mapping] of Object.entries(STORED_MARK_TYPES)) {
      expect(found.has(mapping.type), `no golden file holds ${mapping.type}`).toBe(true);
      const expected = storedAttrNames(documentSchema.marks[name]?.spec.attrs, mapping);
      expect([...(found.get(mapping.type) ?? [])].sort(), mapping.type).toEqual(expected.sort());
    }
  });

  it('DOCE-FORMAT-7.2 fails to read a golden file whose stored names changed', () => {
    const paragraph = fixtures.find(({ name }) => name === 'paragraph.json');
    if (!paragraph) throw new Error('no paragraph golden file');
    const golden = JSON.stringify(paragraph.file);
    const renamed = (from: string, to: string) => JSON.parse(golden.replace(from, to)) as unknown;
    expect(() =>
      readDocumentFile(renamed('"type":"paragraph"', '"type":"para"'), documentSchema),
    ).toThrow(/unknown node para/);
    expect(() => readDocumentFile(renamed('"style":', '"className":'), documentSchema)).toThrow(
      /className/,
    );
  });
});
