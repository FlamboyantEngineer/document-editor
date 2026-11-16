// A document's appendices moved into a section of their own, which composing puts in a template's
// appendix section: from the first heading in an appendix style, else the first top-level heading
// reading `Appendix` or `Annex` and a letter or number, to the end, the page break before it left
// out so the section before does not end on an empty page.

import type { StoredNode, StoredSection } from '../../model/format/document-format.js';

const LABELLED = /^\s*(appendix|annex)\s+([A-Z]|\d+)\b/i;

const textOf = (node: StoredNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join('');

const level = (node: StoredNode) => (typeof node.attrs?.level === 'number' ? node.attrs.level : 1);

// Where the appendices start: a section's index and a block's index in it; null for none.
function appendixStart(
  sections: readonly StoredSection[],
  styled: ReadonlySet<StoredNode>,
): [number, number] | null {
  const find = (is: (node: StoredNode) => boolean): [number, number] | null => {
    for (const [index, section] of sections.entries()) {
      const at = section.content.findIndex(is);
      if (at >= 0) return [index, at];
    }
    return null;
  };
  return (
    find((node) => styled.has(node)) ??
    find(
      (node) =>
        node.type === 'heading' &&
        node.attrs?.title !== true &&
        level(node) === 1 &&
        LABELLED.test(textOf(node)),
    )
  );
}

const isBreakOrEmpty = (node: StoredNode | undefined) =>
  !!node &&
  (node.type === 'pageBreak' ||
    (node.type === 'paragraph' &&
      !textOf(node).trim() &&
      !node.content?.some((c) => c.type !== 'text')));

/**
 * The sections with the appendices, from their start to the end, in sections named `name`, the
 * page breaks and empty paragraphs right before the start left out, each with the index of the
 * section it came from; the sections as they are when the document has no appendices.
 */
export function splitAppendix(
  sections: readonly StoredSection[],
  styled: ReadonlySet<StoredNode>,
  name: string,
): { sections: StoredSection[]; from: number[] } {
  const start = appendixStart(sections, styled);
  if (!start) return { sections: [...sections], from: sections.map((_, index) => index) };
  const [index, at] = start;
  const section = sections[index] as StoredSection;
  let end = at;
  while (isBreakOrEmpty(section.content[end - 1])) end -= 1;
  const before = { ...section, content: section.content.slice(0, end) };
  const after = { ...section, name, content: section.content.slice(at) };
  const later = sections.slice(index + 1).map((each) => ({ ...each, name }));
  const keepsBefore = before.content.length > 0 || index === 0;
  return {
    sections: [...sections.slice(0, index), ...(keepsBefore ? [before] : []), after, ...later],
    from: [
      ...sections.slice(0, index).map((_, each) => each),
      ...(keepsBefore ? [index] : []),
      index,
      ...later.map((_, each) => index + 1 + each),
    ],
  };
}
