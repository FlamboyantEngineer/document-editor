import * as Y from '@y/y';
import * as delta from 'lib0/delta';
import type { Schema } from 'prosemirror-model';
import { FRAGMENT_RULES } from '../model/pagination/fragments.js';
import { type AnyDelta, keyedAttrOf } from './delta.js';
import { isGuardFormatRecord, isGuardProposalMark } from './guard-format.js';
import type { RoomScope } from './room-scope.js';

function hasKnownFormats(format: unknown, schema: Schema): boolean {
  if (format === null || format === undefined) return true;
  if (typeof format !== 'object' || Array.isArray(format)) return false;
  return Object.entries(format).every(([key, attrs]: [string, unknown]) => {
    const name = key.split('--')[0] ?? '';
    const type = schema.marks[name];
    if (!type || typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) return false;
    if (Object.keys(attrs).some((attribute) => !Object.hasOwn(type.spec.attrs ?? {}, attribute)))
      return false;
    const mark = type.create(attrs);
    if (!isGuardProposalMark(mark, schema)) return false;
    const canonical = type.excludes(type) ? name : `${name}--${JSON.stringify(mark.attrs)}`;
    return key === canonical;
  });
}

function hasKnownSplit(type: Y.Type): boolean {
  const kind: unknown = type.getAttr('suggestionSplitKind');
  if (kind === null || kind === undefined) return true;
  if (kind !== 'insertion' && kind !== 'deletion') return false;
  const id: unknown = type.getAttr('suggestionSplitId');
  if (typeof id !== 'string' || !id) return false;
  const author: unknown = type.getAttr('dataAuthor');
  return kind !== 'insertion' || (typeof author === 'string' && author.length > 0);
}

// What only the pages set, as each type's value when whole: the attributes its fragment rule gives
// back when the parts join (`FRAGMENT_RULES`), which part of a split block a node is, a list item
// continued from an earlier page, a continued container's placeholder, and a later part's caption
// text. A room holds the document whole, so each holds its whole value there; another would draw a
// block as a part of one, or a caption with text that is not its own.
const WHOLE_ANY: Readonly<Record<string, unknown>> = {
  splitPartIndex: null,
  orphanedListContinuation: false,
  continuationPlaceholder: false,
};
const WHOLE_OWN: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  table_caption: { continuedText: null },
  code_caption: { continuedText: null },
};

/** Each attribute only the pages set on a node type, with its value when the node is whole. */
export function wholeValuesOf(name: string): Readonly<Record<string, unknown>> {
  return { ...WHOLE_ANY, ...FRAGMENT_RULES[name]?.whole, ...WHOLE_OWN[name] };
}

// Whether a stored value is the whole value: unset, the value itself, or null for false.
const isWhole = (value: unknown, whole: unknown) =>
  value === undefined || value === whole || (value === null && whole === false);

function hasPageOnlyAttr(type: Y.Type, name: string): boolean {
  return Object.entries(wholeValuesOf(name)).some(
    ([attr, whole]) => !isWhole(type.getAttr(attr), whole),
  );
}

// One key of the top node's record attribute (`values.document.name`), which holds a text.
const isStoredKey = (name: string | number, value: unknown) =>
  typeof name === 'string' && keyedAttrOf(name) !== null && typeof value === 'string';

function hasKnownContent(type: Y.Type, options: { schema: Schema; root: Y.Type }): boolean {
  const node =
    type === options.root ? options.schema.topNodeType : options.schema.nodes[String(type.name)];
  if (!node || !hasKnownSplit(type)) return false;
  if (hasPageOnlyAttr(type, node.name)) return false;
  let known = true;
  type.forEachAttr((value: unknown, key: string | number) => {
    if (
      !Object.hasOwn(node.spec.attrs ?? {}, key) &&
      !(type === options.root && isStoredKey(key, value))
    )
      known = false;
  });
  const format: unknown = type.getAttr('suggestionFormat');
  if (format !== undefined && format !== null && !isGuardFormatRecord(format, options.schema))
    return false;
  const value = type.toDelta() as unknown as AnyDelta;
  for (let op = value.children.start; op !== null; op = op.next) {
    if (!delta.$insertOp.check(op) && !delta.$textOp.check(op)) return false;
    if (!hasKnownFormats(op.format, options.schema)) return false;
    if (
      delta.$insertOp.check(op) &&
      op.insert.some(
        (child: unknown) => !(child instanceof Y.Type) || !hasKnownContent(child, options),
      )
    )
      return false;
  }
  return known;
}

function hasKnownMetadata(scope: RoomScope): boolean {
  if (scope.meta.length !== 0 || scope.comments.length !== 0) return false;
  let known = true;
  scope.meta.forEachAttr((_value: unknown, key: string | number) => {
    if (key !== 'formatVersion' && key !== 'template') known = false;
  });
  if (!known) return false;
  const template: unknown = scope.meta.getAttr('template');
  if (template === null || template === undefined) return true;
  if (typeof template !== 'object' || Array.isArray(template)) return false;
  const pin = template as Record<string, unknown>;
  return (
    typeof pin.id === 'string' &&
    typeof pin.revision === 'string' &&
    Object.keys(pin).every((key) => key === 'id' || key === 'revision')
  );
}

/** The schema must account for every stored path, including values its permissive reader ignores. */
export function hasGuardedShape(
  transaction: Y.Transaction,
  options: { scopes: readonly RoomScope[]; schema: Schema },
): boolean {
  if (!options.scopes.every(hasKnownMetadata)) return false;
  for (const type of transaction.changed.keys()) {
    let root = type;
    while (root.parent) root = root.parent;
    const scope = options.scopes.find((candidate) => candidate.content === root);
    if (scope && !hasKnownContent(type, { schema: options.schema, root })) return false;
  }
  return true;
}
