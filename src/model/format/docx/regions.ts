// Page headers and footers as Word's header and footer parts. A region's content is template
// content, whose `{{key}}` tokens are variables, so a page number shows as Word's page field.
// Word carries a section's header on into the next section that names none, so once any section
// has a region, every section names its own part, one part for each distinct content.

import type { StoredNode } from '../document-format.js';
import { writeBlocks } from './blocks.js';
import { WORD_NAMESPACES, XML_DECLARATION } from './word-xml.js';
import type { Writing } from './writing.js';

/** A written header or footer part: its content and the links it holds. */
export interface RegionPart {
  readonly data: string;
  readonly links: readonly string[];
}

const TOKEN = /\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g;

// A text node's tokens as variables beside the text around them.
function expandText(node: StoredNode): StoredNode[] {
  const value = node.text ?? '';
  const parts: StoredNode[] = [];
  let last = 0;
  for (const match of value.matchAll(TOKEN)) {
    const at = match.index;
    if (at > last) parts.push({ ...node, text: value.slice(last, at) });
    parts.push({ type: 'variable', attrs: { key: match[1] ?? '' } });
    last = at + match[0].length;
  }
  if (!parts.length) return [node];
  if (last < value.length) parts.push({ ...node, text: value.slice(last) });
  return parts;
}

/** Template content with each `{{key}}` token in its text a variable. */
export function expandTokens(content: readonly StoredNode[]): StoredNode[] {
  return content.flatMap((node) => {
    if (node.type === 'text') return expandText(node);
    return node.content ? [{ ...node, content: expandTokens(node.content) }] : [node];
  });
}

/** A header or footer part with a region's content, which is never counted or numbered. */
export function writeRegionPart(
  kind: 'header' | 'footer',
  content: readonly StoredNode[],
  writing: Writing,
): RegionPart {
  const links: string[] = [];
  const style = kind === 'header' ? 'Header' : 'Footer';
  const body =
    writeBlocks(expandTokens(content), { ...writing, links, structural: false }) ||
    `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr></w:p>`;
  const element = kind === 'header' ? 'w:hdr' : 'w:ftr';
  return { data: `${XML_DECLARATION}<${element} ${WORD_NAMESPACES}>${body}</${element}>`, links };
}
