// JSON Schemas of what the automation API takes and gives, for a host that offers it to an agent
// as tools: the input of a batch of edits, the description of a stored document an agent reads
// before it edits, and the reason a batch was refused. Each schema stands alone (JSON Schema
// 2020-12), with the stored node it needs in its own `$defs`.

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

const string = { type: 'string' } as const;
const offset = { type: 'integer', minimum: 0 } as const;
const nullable = (type: 'string' | 'integer') => ({ type: [type, 'null'] }) as const;

// A stored node and mark, as the stored format writes them (`StoredNode`, `StoredMark`).
const STORED_DEFS = {
  mark: {
    type: 'object',
    properties: { type: string, attrs: { type: 'object' } },
    required: ['type'],
    additionalProperties: false,
  },
  node: {
    type: 'object',
    properties: {
      type: string,
      attrs: { type: 'object' },
      content: { type: 'array', items: { $ref: '#/$defs/node' } },
      text: string,
      marks: { type: 'array', items: { $ref: '#/$defs/mark' } },
    },
    required: ['type'],
    additionalProperties: false,
  },
} as const;

const blocks = { type: 'array', items: { $ref: '#/$defs/node' }, minItems: 1 } as const;

// Where an edit acts (`EditAddress`).
const address = {
  type: 'object',
  description:
    'An element by id, and a range of its text by offsets; `expect` is the text read there.',
  properties: { elementId: string, from: offset, to: offset, expect: string },
  required: ['elementId'],
  additionalProperties: false,
} as const;

const edit = (op: string, properties: Record<string, unknown>, required: readonly string[]) => ({
  type: 'object',
  properties: { op: { const: op }, ...properties },
  required: ['op', ...required],
  additionalProperties: false,
});

// One edit of a batch (`AutomationEdit`).
const EDIT = {
  oneOf: [
    edit('insertText', { at: address, text: string }, ['at', 'text']),
    edit('replaceText', { at: address, text: string }, ['at', 'text']),
    edit('deleteText', { at: address }, ['at']),
    edit('comment', { at: address, text: string }, ['at', 'text']),
    {
      ...edit('insertBlocks', { before: string, after: string, content: blocks }, ['content']),
      anyOf: [{ required: ['before'] }, { required: ['after'] }],
    },
    edit('replaceBlock', { elementId: string, content: blocks }, ['elementId', 'content']),
    edit('deleteBlock', { elementId: string }, ['elementId']),
    edit('setAttrs', { elementId: string, attrs: { type: 'object' } }, ['elementId', 'attrs']),
  ],
} as const;

/** The JSON Schemas of the automation API, for a host offering it to an agent as tools. */
export const AUTOMATION_SCHEMAS = {
  /** A batch of edits an agent sends (`applyEdits`, `applyStoredEdits`). */
  applyEdits: {
    $schema: DIALECT,
    title: 'Apply edits',
    type: 'object',
    properties: {
      revision: {
        type: 'string',
        description: 'The revision the edits were made against, as the description gave it.',
      },
      mode: { enum: ['direct', 'suggest'] },
      edits: { type: 'array', items: EDIT, minItems: 1 },
    },
    required: ['edits'],
    additionalProperties: false,
    $defs: STORED_DEFS,
  },
  /** A stored document as an agent reads it (`describeDocument`). */
  documentDescription: {
    $schema: DIALECT,
    title: 'Document description',
    type: 'object',
    properties: {
      revision: string,
      template: {
        oneOf: [
          {
            type: 'object',
            properties: { id: string, revision: nullable('string') },
            required: ['id'],
            additionalProperties: false,
          },
          { type: 'null' },
        ],
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: offset,
            id: nullable('string'),
            name: nullable('string'),
            editable: { type: 'boolean' },
          },
          required: ['index', 'id', 'name', 'editable'],
          additionalProperties: false,
        },
      },
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            elementId: string,
            type: string,
            text: string,
            length: offset,
            parentId: nullable('string'),
            section: { type: ['integer', 'null'], minimum: 0 },
            number: string,
          },
          required: ['elementId', 'type', 'text', 'length', 'parentId', 'section', 'number'],
          additionalProperties: false,
        },
      },
      problems: {
        type: 'array',
        items: {
          type: 'object',
          properties: { path: string, message: string, kept: { type: 'boolean' } },
          required: ['path', 'message', 'kept'],
          additionalProperties: false,
        },
      },
    },
    required: ['revision', 'template', 'sections', 'blocks', 'problems'],
    additionalProperties: false,
  },
  /** Why a batch was refused (`AutomationError`, or a `VersionConflict` on a stored document). */
  editError: {
    $schema: DIALECT,
    title: 'Edit error',
    oneOf: [
      {
        type: 'object',
        properties: {
          kind: { enum: ['not-found', 'stale', 'locked', 'invalid', 'unsupported'] },
          index: offset,
          message: string,
        },
        required: ['kind', 'index', 'message'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: { kind: { const: 'conflict' }, message: string, revision: string },
        required: ['kind', 'message', 'revision'],
        additionalProperties: false,
      },
    ],
  },
} as const;
