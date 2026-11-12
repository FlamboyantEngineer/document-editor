// A document as HTML and back, for interchange with other applications: written as the schema
// writes each node, read as the schema reads markup, from an inert document so nothing in the
// markup runs or loads. HTML from a word processor is cleaned of its own markup first.

import {
  DOMParser,
  DOMSerializer,
  type Node as ProseMirrorNode,
  type Schema,
} from 'prosemirror-model';
import type { StoredContent } from './document-format.js';
import { writeStoredContent } from './document-format-write.js';

/** The markup a document's content writes, as HTML text. */
export function writeHtml(doc: ProseMirrorNode, owner: Document): string {
  const inert = owner.implementation.createHTMLDocument('');
  const container = inert.createElement('div');
  container.appendChild(
    DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content, { document: inert }),
  );
  return container.innerHTML;
}

// The body of HTML text parsed in an inert document, where scripts never run and images never load.
function inertBody(html: string, owner: Document): HTMLElement {
  const Parser = owner.defaultView?.DOMParser;
  if (Parser) return new Parser().parseFromString(html, 'text/html').body;
  const inert = owner.implementation.createHTMLDocument('');
  inert.body.innerHTML = html;
  return inert.body;
}

/** A document read from HTML, as the schema reads markup; word processor markup is cleaned. */
export function readHtml(html: string, schema: Schema, owner: Document): ProseMirrorNode {
  const body = inertBody(isWordHtml(html) ? cleanWordHtml(html, owner) : html, owner);
  return DOMParser.fromSchema(schema).parse(body);
}

/**
 * Stored content read from HTML, such as a template region's or section's content a host keeps as
 * markup: its blocks as the schema reads them, inline text in paragraphs, word processor markup
 * cleaned. Variables stay live, and `{{key}}` tokens stay text for `readTemplateContent` to read.
 */
export function readHtmlContent(html: string, schema: Schema, owner: Document): StoredContent {
  const body = inertBody(isWordHtml(html) ? cleanWordHtml(html, owner) : html, owner);
  // Blocks are read into a region of a page, which holds any block a document's body holds.
  const container = (schema.nodes.page_content ?? schema.topNodeType).create();
  const content = DOMParser.fromSchema(schema).parse(body, { topNode: container });
  return writeStoredContent(content.content);
}

/** Whether HTML comes from a word processor that writes its own Office markup. */
export function isWordHtml(html: string): boolean {
  return /urn:schemas-microsoft-com:office|class="?Mso|mso-[a-z-]+\s*:/i.test(html);
}

// The list a Word paragraph is an item of: its list, level and whether it is numbered.
function listItemOf(paragraph: Element): { list: string; level: number; ordered: boolean } | null {
  const style = paragraph.getAttribute('style') ?? '';
  const match = /mso-list:\s*(l\d+)\s+level(\d+)/i.exec(style);
  if (!match) return null;
  const marker = paragraph.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
  const text = (marker?.textContent ?? '').trim();
  return {
    list: match[1] ?? '',
    level: Number(match[2]) || 1,
    ordered: /^(\d+|[a-z]|[ivxlc]+)[.)]$/i.test(text),
  };
}

type ListLevel = { level: number; element: HTMLElement };

// The list an item of a level goes in: the open list of its level, or a new one, nested in the
// last item of the list above it, or placed before the paragraph that starts the run.
function listFor(
  stack: ListLevel[],
  item: { level: number; ordered: boolean },
  { paragraph, owner }: { paragraph: Element; owner: Document },
): ListLevel {
  while (stack.length && (stack.at(-1)?.level ?? 0) > item.level) stack.pop();
  const open = stack.at(-1);
  if (open && open.level >= item.level) return open;
  const element = owner.createElement(item.ordered ? 'ol' : 'ul');
  const parentItem = open?.element.lastElementChild;
  if (parentItem) parentItem.appendChild(element);
  else paragraph.before(element);
  const list = { level: item.level, element };
  stack.push(list);
  return list;
}

// Turns runs of Word list paragraphs into nested lists, each item its paragraph's content.
function rebuildLists(body: HTMLElement, owner: Document) {
  let stack: ListLevel[] = [];
  let previous: Element | null = null;
  for (const paragraph of body.querySelectorAll('p')) {
    const item = listItemOf(paragraph);
    if (!item || paragraph.previousElementSibling !== previous) stack = [];
    if (!item) {
      previous = null;
      continue;
    }
    for (const marker of paragraph.querySelectorAll('[style*="mso-list"]')) marker.remove();
    const list = listFor(stack, item, { paragraph, owner });
    const li = owner.createElement('li');
    const p = owner.createElement('p');
    p.innerHTML = paragraph.innerHTML;
    li.appendChild(p);
    list.element.appendChild(li);
    previous = paragraph;
    // The paragraph stays in place until the run ends, so the next one is seen to follow it.
    paragraph.setAttribute('data-word-list-item', 'true');
  }
  for (const done of body.querySelectorAll('[data-word-list-item]')) done.remove();
}

// A word processor's tracked changes and comments, which never become suggestions or comments
// (D12): the changes read as accepted, so deleted runs go and inserted runs keep their text, and the
// comments' references, ranges and texts go.
const reviewDropped = [
  'del',
  '.msoDel',
  '.MsoCommentReference',
  'a[href^="#_msocom"]',
  '[style*="mso-element:comment"]',
  '[style*="mso-element: comment"]',
].join(', ');
const reviewUnwrapped = 'ins, .msoIns';

function dropReviewMarkup(body: HTMLElement) {
  for (const element of body.querySelectorAll(reviewDropped)) element.remove();
  for (const element of body.querySelectorAll(reviewUnwrapped)) {
    element.replaceWith(...element.childNodes);
  }
}

/**
 * HTML from a word processor without its own markup: conditional comments, Office elements and
 * styles, class names and the styles they carry are dropped, its tracked changes read as accepted
 * and its comments left out, and its list paragraphs become lists.
 */
export function cleanWordHtml(html: string, owner: Document): string {
  const stripped = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!\[if !supportLists\]>|<!\[endif\]>/gi, '')
    .replace(/<\/?o:p>/gi, '');
  const body = inertBody(stripped, owner);
  for (const element of body.querySelectorAll('style, meta, link, xml, script, title'))
    element.remove();
  dropReviewMarkup(body);
  rebuildLists(body, owner);
  for (const element of body.querySelectorAll('*')) {
    const name = element.tagName.toLowerCase();
    if (name.includes(':')) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    if (/^Mso/.test(element.getAttribute('class') ?? '')) element.removeAttribute('class');
    const style = element.getAttribute('style');
    if (style) {
      const kept = style
        .split(';')
        .filter((rule) => rule.trim() && !/^\s*mso-/i.test(rule))
        .join(';');
      if (kept) element.setAttribute('style', kept);
      else element.removeAttribute('style');
    }
  }
  return body.innerHTML;
}
