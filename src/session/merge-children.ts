import type { StoredNode, StoredSection } from '../model/format/document-format.js';

const emptyBlockContainers = new Set([
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'columns',
]);
const textblockContainers = new Set(['column', 'tableCell', 'tableHeader']);

/** Rebuilds a container after merging its children, keeping the required document structure. */
export function withMergedChildren(
  value: StoredNode | StoredSection,
  children: StoredNode[],
): StoredNode | StoredSection | null {
  if (!('type' in value)) return { ...value, content: children };
  const { type } = value;
  if (!children.length && emptyBlockContainers.has(type)) return null;
  if (type === 'table' && !children.some((node) => node.type === 'tableRow')) return null;
  const needsParagraph =
    (!children.length && textblockContainers.has(type)) ||
    (type === 'listItem' && children[0]?.type !== 'paragraph');
  return { ...value, content: needsParagraph ? [{ type: 'paragraph' }, ...children] : children };
}
