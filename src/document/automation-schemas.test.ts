// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDocumentSchema,
  type DocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../model/index.js';
import { applyStoredEdits, describeDocument } from './automation.js';
import { AUTOMATION_SCHEMAS } from './automation-schemas.js';

// The JSON Schema keywords the schemas use, and the checks below make of them. A schema using any
// other keyword fails the first test, so no keyword goes unchecked.
type Schema = Readonly<Record<string, unknown>>;

const ANNOTATIONS = new Set(['$schema', 'title', 'description', '$defs']);

const TYPES: Readonly<Record<string, (value: unknown) => boolean>> = {
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  array: Array.isArray,
  string: (value) => typeof value === 'string',
  integer: Number.isInteger,
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
};

type Check = (value: unknown, keyword: unknown, schema: Schema, root: Schema) => boolean;

const asSchemas = (value: unknown) => value as readonly Schema[];
const asRecord = (value: unknown) => value as Readonly<Record<string, unknown>>;

const KEYWORDS: Readonly<Record<string, Check>> = {
  type: (value, type) =>
    (Array.isArray(type) ? type : [type]).some((name: string) => TYPES[name]?.(value) === true),
  const: (value, constant) => value === constant,
  enum: (value, values) => (values as readonly unknown[]).includes(value),
  minimum: (value, minimum) => typeof value !== 'number' || value >= Number(minimum),
  minItems: (value, min) => !Array.isArray(value) || value.length >= Number(min),
  required: (value, names) =>
    !TYPES.object?.(value) || (names as string[]).every((name) => name in asRecord(value)),
  properties: (value, properties, _, root) =>
    !TYPES.object?.(value) ||
    Object.entries(asRecord(value)).every(
      ([name, each]) =>
        !(name in asRecord(properties)) || valid(each, asRecord(properties)[name] as Schema, root),
    ),
  additionalProperties: (value, allowed, schema) =>
    allowed !== false ||
    !TYPES.object?.(value) ||
    Object.keys(asRecord(value)).every((name) => name in asRecord(schema.properties ?? {})),
  items: (value, items, _, root) =>
    !Array.isArray(value) || value.every((each) => valid(each, items as Schema, root)),
  oneOf: (value, schemas, _, root) =>
    asSchemas(schemas).filter((each) => valid(value, each, root)).length === 1,
  anyOf: (value, schemas, _, root) => asSchemas(schemas).some((each) => valid(value, each, root)),
  $ref: (value, ref, _, root) => {
    const name = String(ref).replace('#/$defs/', '');
    return valid(value, asRecord(root.$defs)[name] as Schema, root);
  },
};

function valid(value: unknown, schema: Schema, root: Schema = schema): boolean {
  return Object.entries(schema).every(
    ([keyword, argument]) =>
      ANNOTATIONS.has(keyword) || KEYWORDS[keyword]?.(value, argument, schema, root) === true,
  );
}

// Every keyword a schema uses, at any depth.
function keywords(schema: Schema, found = new Set<string>()): Set<string> {
  for (const [keyword, argument] of Object.entries(schema)) {
    found.add(keyword);
    const nested =
      keyword === 'properties' || keyword === '$defs'
        ? Object.values(asRecord(argument))
        : keyword === 'items'
          ? [argument]
          : keyword === 'oneOf' || keyword === 'anyOf'
            ? asSchemas(argument)
            : [];
    for (const each of nested) keywords(each as Schema, found);
  }
  return found;
}

const schema = createDocumentSchema();
const FIXTURES = 'test/fixtures/documents';
const fixture = <T>(name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as T;
const documents = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length));

const { applyEdits, documentDescription, editError } = AUTOMATION_SCHEMAS;

const SAMPLE_EDITS = [
  { op: 'insertText', at: { elementId: 'a1a1a1a1', from: 4 }, text: 'fault ' },
  { op: 'replaceText', at: { elementId: 'a1a1a1a1', from: 0, to: 3, expect: 'The' }, text: 'A' },
  { op: 'deleteText', at: { elementId: 'a1a1a1a1' } },
  { op: 'comment', at: { elementId: 'a1a1a1a1' }, text: 'Check this' },
  {
    op: 'insertBlocks',
    after: 'a1a1a1a1',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Bold', marks: [{ type: 'strong' }] }],
      },
    ],
  },
  { op: 'replaceBlock', elementId: 'a1a1a1a1', content: [{ type: 'horizontal_rule' }] },
  { op: 'deleteBlock', elementId: 'a1a1a1a1' },
  { op: 'setAttrs', elementId: 'a1a1a1a1', attrs: { level: 2 } },
];

describe('automation schemas', () => {
  it('DOCE-AUTOMATION-4.5 uses only the keywords the samples are checked with', () => {
    const known = new Set([...ANNOTATIONS, ...Object.keys(KEYWORDS)]);
    for (const each of Object.values(AUTOMATION_SCHEMAS)) {
      expect([...keywords(each)].filter((keyword) => !known.has(keyword))).toEqual([]);
    }
  });

  it('DOCE-AUTOMATION-4.5 accepts every kind of edit and refuses malformed ones', () => {
    expect(valid({ revision: 'r1', mode: 'suggest', edits: SAMPLE_EDITS }, applyEdits)).toBe(true);
    for (const edit of SAMPLE_EDITS)
      expect(valid({ edits: [edit] }, applyEdits), edit.op).toBe(true);
    const malformed = [
      {},
      { edits: [] },
      { edits: [{ op: 'insertText', at: { elementId: 'a1a1a1a1' } }] },
      { edits: [{ op: 'insertText', at: { from: 1 }, text: 'x' }] },
      { edits: [{ op: 'insertText', at: { elementId: 'a1a1a1a1', from: -1 }, text: 'x' }] },
      { edits: [{ op: 'insertBlocks', content: [{ type: 'paragraph' }] }] },
      { edits: [{ op: 'replaceBlock', elementId: 'a1a1a1a1', content: [{ text: 'x' }] }] },
      { edits: [{ op: 'move', elementId: 'a1a1a1a1' }] },
      { edits: [{ op: 'deleteBlock', elementId: 'a1a1a1a1', extra: true }] },
      { mode: 'force', edits: [SAMPLE_EDITS[0]] },
    ];
    for (const sample of malformed)
      expect(valid(sample, applyEdits), JSON.stringify(sample)).toBe(false);
  });

  it.each(documents)('DOCE-AUTOMATION-4.5 describes %s as the description schema says', (name) => {
    const content = fixture<DocumentFile>(name);
    const template = resolveTemplateFile(
      fixture<TemplateFile>(`templates/${content.template?.id}`),
      {
        loadTemplate: (id) => fixture<TemplateFile>(`templates/${id}`),
      },
    );
    const description = describeDocument({ content, revision: 'r1' }, { schema, template });
    expect(valid(JSON.parse(JSON.stringify(description)), documentDescription)).toBe(true);
  });

  it('DOCE-AUTOMATION-4.5 gives refusals as the error schema says', () => {
    const content = fixture<DocumentFile>('minimal-paragraph');
    const options = {
      schema,
      revision: 'r1',
      actor: { id: 'agent-1', kind: 'agent' as const },
      mode: 'direct' as const,
    };
    const errors = [
      applyStoredEdits({ content, revision: 'r2' }, [], options),
      applyStoredEdits(
        { content, revision: 'r1' },
        [{ op: 'deleteBlock', elementId: 'gone' }],
        options,
      ),
    ].map((result) => (result.ok ? null : result.error));
    expect(errors.map((error) => error?.kind)).toEqual(['conflict', 'not-found']);
    for (const error of errors) expect(valid(error, editError)).toBe(true);
    expect(valid({ kind: 'conflict', index: 0, message: 'x' }, editError)).toBe(false);
  });
});
