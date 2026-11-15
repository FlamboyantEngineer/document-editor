import * as Y from '@y/y';
import * as delta from 'lib0/delta';
import type { Schema } from 'prosemirror-model';
import type { AnyDelta } from './delta.js';
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

function hasKnownContent(type: Y.Type, options: { schema: Schema; root: Y.Type }): boolean {
  const node =
    type === options.root ? options.schema.topNodeType : options.schema.nodes[String(type.name)];
  if (!node || !hasKnownSplit(type)) return false;
  let known = true;
  type.forEachAttr((_value: unknown, key: string | number) => {
    if (!Object.hasOwn(node.spec.attrs ?? {}, key)) known = false;
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
