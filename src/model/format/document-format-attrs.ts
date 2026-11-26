// What a stored node's attributes must be: each of the kind its attribute takes, and present where
// its type requires it, with no default, as an image's width and height (DOCE-SCHEMA-3.14). A
// stored node without them cannot be read, and the reader says why (DOCE-FORMAT-1.5).

import type { NodeType } from 'prosemirror-model';
import { STORED_NODE_TYPES, storedAttrName } from './document-format.js';

type Attrs = Record<string, unknown>;

const isRecord = (value: unknown): value is Attrs =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * What is wrong with a value by the kinds its attribute takes (its `validate`, checked as
 * ProseMirror checks it), or null. ProseMirror checks them only once the whole document is built,
 * where a refusal names no place and no policy can read past it.
 */
export function kindProblem(attribute: unknown, value: unknown): string | null {
  const validate: unknown = isRecord(attribute) ? attribute.validate : undefined;
  if (typeof validate === 'string') {
    const kinds = validate.split('|');
    return kinds.includes(value === null ? 'null' : typeof value)
      ? null
      : `it must be ${kinds.join(' or ')}`;
  }
  if (typeof validate !== 'function') return null;
  try {
    (validate as (value: unknown) => void)(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'it is not of its kind';
  }
}

const requiredAttrs = (type: NodeType): string[] =>
  Object.entries(type.spec.attrs ?? {})
    .filter(([, spec]) => !Object.hasOwn(spec, 'default'))
    .map(([name]) => name);

/** Whether attributes read for a type lack one it requires. */
export const lacksRequiredAttrs = (type: NodeType, attrs: Attrs): boolean =>
  requiredAttrs(type).some((name) => attrs[name] === undefined);

/**
 * What a lenient read says of a stored node it cannot read: the required attributes it lacks, by
 * their stored names, when it lacks any.
 */
export function unreadableMessage(stored: Attrs, type: NodeType): string {
  const given = isRecord(stored.attrs) ? stored.attrs : {};
  const mapping = STORED_NODE_TYPES[type.name];
  const missing = requiredAttrs(type)
    .map((name) => storedAttrName(mapping, name, type.spec) ?? name)
    .filter((name) => given[name] === undefined);
  const name = String(stored.type);
  return missing.length ? `${name} has no ${missing.join(' or ')}` : `${name} cannot be read`;
}
