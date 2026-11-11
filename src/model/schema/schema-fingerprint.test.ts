import {
  type Attrs,
  DOMSerializer,
  type MarkType,
  type Node,
  type NodeType,
  type ParseRule,
  type Schema,
} from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { expectJsonSnapshot } from '../../../test/json-snapshot.js';
import { createDocumentSchema, DOCUMENT_MARK_ORDER, DOCUMENT_NODE_ORDER } from '../index.js';

// The schema's fingerprint: everything about each type that decides how stored and pasted
// documents read and write. A change to it is a change to the stored contract (DOCE-FORMAT-7.1).

/** A parse rule as data: its fields, with functions reduced to whether they are present. */
function parseRuleFingerprint(rule: ParseRule): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rule)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'function' ? 'function' : value]),
  );
}

interface AttrSpec {
  default?: unknown;
  validate?: string | ((value: unknown) => void);
}

type AttrSpecs = Readonly<Record<string, AttrSpec>> | undefined;

/** Each attribute's default (none when it is required) and the kinds of value it takes. */
function attrFingerprints(specs: AttrSpecs) {
  return Object.fromEntries(
    Object.entries(specs ?? {}).map(([name, attr]) => [
      name,
      {
        ...('default' in attr ? { default: attr.default ?? null } : { required: true }),
        ...(attr.validate === undefined
          ? {}
          : { validate: typeof attr.validate === 'function' ? 'function' : attr.validate }),
      },
    ]),
  );
}

/** Whether a value is of a kind an attribute's `validate` string allows. */
function isValid(attr: AttrSpec, value: unknown): boolean {
  if (typeof attr.validate !== 'string') return 'default' in attr || value !== undefined;
  const kind = value === null ? 'null' : typeof value;
  return attr.validate.split('|').includes(kind);
}

/** Samples for attributes whose kind a generic sample does not meet. */
const SAMPLES: Readonly<Record<string, unknown>> = { colwidth: [120] };

/** A value unlike an attribute's default, of a kind it takes, so its markup shows where it goes. */
function sampleValue(name: string, attr: AttrSpec): unknown {
  if (Object.hasOwn(SAMPLES, name)) return SAMPLES[name];
  const kinds = typeof attr.validate === 'string' ? attr.validate.split('|') : [];
  const fallback = attr.default;
  if (typeof fallback === 'boolean' || (fallback == null && kinds.includes('boolean')))
    return !fallback;
  if (typeof fallback === 'number') return fallback + 2;
  if (fallback == null && kinds.includes('number')) return 2;
  if (Array.isArray(fallback)) return [...(fallback as unknown[]), 2];
  return `sample-${name}`;
}

/** Every attribute at its default, or at a sample value where the default is not valid. */
function defaultAttrs(specs: AttrSpecs): Attrs {
  return Object.fromEntries(
    Object.entries(specs ?? {}).map(([name, attr]) => [
      name,
      isValid(attr, attr.default) ? attr.default : sampleValue(name, attr),
    ]),
  );
}

/** Every attribute set away from its default. */
function filledAttrs(specs: AttrSpecs): Attrs {
  return Object.fromEntries(
    Object.entries(specs ?? {}).map(([name, attr]) => [name, sampleValue(name, attr)]),
  );
}

function render(spec: Parameters<typeof DOMSerializer.renderSpec>[1]): string {
  const container = document.createElement('div');
  container.append(DOMSerializer.renderSpec(document, spec).dom);
  return container.innerHTML;
}

function nodeMarkup(type: NodeType, attrs: Attrs): string | null {
  if (!type.spec.toDOM) return null;
  const node: Node = type.createAndFill(attrs) ?? type.create(attrs);
  return render(type.spec.toDOM(node));
}

function markMarkup(type: MarkType, attrs: Attrs): string | null {
  if (!type.spec.toDOM) return null;
  return render(type.spec.toDOM(type.create(attrs), true));
}

const NODE_FLAGS = [
  'inline',
  'atom',
  'code',
  'defining',
  'definingAsContext',
  'definingForContent',
  'isolating',
  'selectable',
  'draggable',
  'whitespace',
  'leafText',
] as const;

function nodeFingerprint(type: NodeType, ordinal: number) {
  const { spec } = type;
  return {
    name: type.name,
    ordinal,
    group: spec.group ?? null,
    content: spec.content ?? null,
    marks: spec.marks ?? null,
    flags: Object.fromEntries(
      NODE_FLAGS.filter((flag) => spec[flag] !== undefined).map((flag) => [
        flag,
        typeof spec[flag] === 'function' ? 'function' : spec[flag],
      ]),
    ),
    attrs: attrFingerprints(spec.attrs as AttrSpecs),
    parseDOM: (spec.parseDOM ?? []).map(parseRuleFingerprint),
    toDOM: {
      defaults: nodeMarkup(type, defaultAttrs(spec.attrs as AttrSpecs)),
      filled: nodeMarkup(type, filledAttrs(spec.attrs as AttrSpecs)),
    },
  };
}

function markFingerprint(type: MarkType, ordinal: number) {
  const { spec } = type;
  return {
    name: type.name,
    ordinal,
    inclusive: spec.inclusive ?? null,
    excludes: spec.excludes ?? null,
    group: spec.group ?? null,
    spanning: spec.spanning ?? null,
    attrs: attrFingerprints(spec.attrs as AttrSpecs),
    parseDOM: (spec.parseDOM ?? []).map(parseRuleFingerprint),
    toDOM: {
      defaults: markMarkup(type, defaultAttrs(spec.attrs as AttrSpecs)),
      filled: markMarkup(type, filledAttrs(spec.attrs as AttrSpecs)),
    },
  };
}

function schemaFingerprint(schema: Schema) {
  return {
    topNode: schema.topNodeType.name,
    nodes: Object.values(schema.nodes).map((type, index) => nodeFingerprint(type, index)),
    marks: Object.values(schema.marks).map((type, index) => markFingerprint(type, index)),
  };
}

describe('schema fingerprint', () => {
  it('DOCE-FORMAT-7.1 matches the committed fingerprint of the document schema', async () => {
    await expectJsonSnapshot(
      schemaFingerprint(documentSchema),
      './schema-fingerprint.snapshot.json',
    );
  });

  it('DOCE-FORMAT-7.1 fingerprints every built-in type in its documented order', () => {
    const { nodes, marks } = schemaFingerprint(documentSchema);
    expect(nodes.map(({ name }) => name)).toEqual(
      Object.entries(DOCUMENT_NODE_ORDER)
        .sort(([, a], [, b]) => a - b)
        .map(([name]) => name),
    );
    expect(marks.map(({ name }) => name)).toEqual(Object.keys(DOCUMENT_MARK_ORDER));
  });

  it('DOCE-FORMAT-7.1 changes when an attribute default, a parse tag or the markup changes', () => {
    const base = schemaFingerprint(documentSchema);
    const refined = (refine: (spec: Record<string, unknown>) => Record<string, unknown>) =>
      schemaFingerprint(
        createDocumentSchema({
          extensions: [
            {
              name: 'drift',
              refineNode: (name, spec) => (name === 'heading' ? (refine(spec) as never) : spec),
            },
          ],
        }),
      );
    const defaults = refined((spec) => ({
      ...spec,
      attrs: { ...(spec.attrs as object), level: { default: 3 } },
    }));
    const tags = refined((spec) => ({ ...spec, parseDOM: [{ tag: 'h7' }] }));
    const markup = refined((spec) => ({ ...spec, toDOM: () => ['h6', 0] }));
    for (const drifted of [defaults, tags, markup]) expect(drifted).not.toEqual(base);
  });
});
