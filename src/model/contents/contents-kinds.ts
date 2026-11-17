// The kinds of list a document's contents have, and their entries: each kind names the nodes or
// marks it lists and how it shows them; an entry has its number, text, level, position and page.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { abbreviationTargetId, compareAbbreviations } from '../glossary.js';
import { EXTERNAL_DOCUMENT_REFERENCE_TYPE } from '../reference-format.js';
import { deriveLinkedCodeBlockCaption } from '../schema/caption-text.js';
import {
  citedAttrs,
  citedGroup,
  citedIdentity,
  citedNumber,
  citedOrder,
  citedText,
  dropUnnamedCitations,
} from './reference-entries.js';

/**
 * One kind of list: the nodes or marks it lists and how it shows them. For a mark, each run of text
 * that carries it is one entry, and the callbacks get the run's first text node and the mark.
 */
export interface ContentsKind {
  /** The node type names it lists. */
  readonly nodes: readonly string[];
  /** The mark type names it lists. */
  readonly marks?: readonly string[] | undefined;
  /** Whether it lists a node or mark of those types; every one by default. */
  readonly include?: ((node: ProseMirrorNode, mark?: Mark) => boolean) | undefined;
  /** An entry's text: a node's caption, or its text, or a mark's text, by default. */
  readonly text?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
  /**
   * An entry's level, which a list's depth limits: a heading's level by default, and 0, which
   * every depth shows, for other nodes.
   */
  readonly level?: ((node: ProseMirrorNode, mark?: Mark) => number) | undefined;
  /**
   * An entry's number for a node the template does not number. The template numbers headings and
   * its numbered objects, and their entries show its numbers.
   */
  readonly number?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
  /**
   * Whether it lists only what follows the document's first table of contents, as the table of
   * contents and the lists of objects and references do; front matter before it is left out, but
   * keeps its numbers. Without a table of contents nothing is left out.
   */
  readonly after?: boolean | undefined;
  /** Orders the entries, such as by their text for a glossary; document order by default. */
  readonly sort?: ((a: CatalogEntry, b: CatalogEntry) => number) | undefined;
  /**
   * Lists only the first entry of each identity, such as one per term or one per cited document.
   * Defaults to false.
   */
  readonly unique?: boolean | undefined;
  /** What makes two entries one for `unique`: their number and text by default. */
  readonly identity?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
  /**
   * Leaves out the entries another entry of the list already says more about, before `unique`,
   * such as a citation that recorded no document number beside one of the same document that did.
   */
  readonly drop?: ((entries: readonly CatalogEntry[]) => CatalogEntry[]) | undefined;
  /**
   * An entry's group: the entries of a kind that groups are listed group by group, each under a
   * heading its list's labels name, after `sort`, and a list may show only some groups.
   */
  readonly group?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
  /** The order of the groups; others follow, in the order of their names. */
  readonly groups?: readonly string[] | undefined;
  /** What an entry sorts by, part by part, for `sort` (`compareOrder`); none by default. */
  readonly order?: ((node: ProseMirrorNode, mark?: Mark) => readonly string[]) | undefined;
  /**
   * The attributes of the citation an entry stands for: its row opens where the host links the
   * citation, in a new tab, or is plain text when the host links it nowhere.
   */
  readonly cites?:
    ((node: ProseMirrorNode, mark?: Mark) => Readonly<Record<string, unknown>>) | undefined;
  /** The text between an entry's number and its text, when it has both; none by default. */
  readonly separator?: string | undefined;
  /** Whether an entry shows its page number. Defaults to true. */
  readonly showPage?: boolean | undefined;
  /** Whether an entry draws a leader to its page number. Defaults to true. */
  readonly leader?: boolean | undefined;
  /**
   * The element id an entry's row carries, so links to it resolve, such as an abbreviation's link
   * to its entry in a list of abbreviations; none by default.
   */
  readonly anchor?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
}

const attrText = (value: unknown) => (typeof value === 'string' ? value : '');

// Whether a citation names another document, not a place in this one.
const isExternal = (_node: ProseMirrorNode, mark?: Mark) =>
  !String(mark?.attrs.refType ?? '').startsWith('internal-');

/** Compares two entries by their `order`, part by part, ignoring case and accents. */
export function compareOrder(a: CatalogEntry, b: CatalogEntry): number {
  const left = a.order ?? [];
  const right = b.order ?? [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? '').localeCompare(right[index] ?? '', undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (delta !== 0) return delta;
  }
  return a.pos - b.pos;
}

const byAbbreviation = (a: CatalogEntry, b: CatalogEntry) =>
  compareAbbreviations(
    { abbr: a.number, expansion: a.text, entryId: a.identity ?? '' },
    { abbr: b.number, expansion: b.text, entryId: b.identity ?? '' },
  );

// A code block's caption, and a linked one's, which names its source.
const codeText = (node: ProseMirrorNode) =>
  node.type.name === 'linked_code_block'
    ? deriveLinkedCodeBlockCaption(node.attrs.url)
    : attrText(node.attrs.caption);

// Whether a table, figure or code block shows its caption, which one that is listed and numbered
// does.
const isCaptioned = (node: ProseMirrorNode) => node.attrs.captionEnabled !== false;

/**
 * The kinds of list a document has unless a host gives others, keyed by a list's `tocType`, in the
 * order the insert menu offers them.
 */
export const DEFAULT_CONTENTS_KINDS = {
  toc: { nodes: ['heading'], after: true },
  figures: { nodes: ['figure'], include: isCaptioned, after: true, separator: ' - ' },
  tables: {
    nodes: ['table'],
    include: isCaptioned,
    after: true,
    separator: ' - ',
  },
  // An equation's entry is its number alone.
  equations: { nodes: ['math_display'], text: () => '', after: true },
  codeBlocks: {
    nodes: ['code_block', 'linked_code_block'],
    include: isCaptioned,
    text: codeText,
    after: true,
    separator: ' - ',
  },
  // Each document, and each revision of it, cited after the table of contents, once, grouped by
  // its reference type and ordered by publisher and number.
  references: {
    nodes: [],
    marks: ['reference'],
    include: isExternal,
    number: citedNumber,
    text: citedText,
    separator: ' - ',
    after: true,
    unique: true,
    identity: citedIdentity,
    drop: dropUnnamedCitations,
    group: citedGroup,
    groups: [EXTERNAL_DOCUMENT_REFERENCE_TYPE],
    order: citedOrder,
    sort: compareOrder,
    cites: citedAttrs,
    showPage: false,
    leader: false,
  },
  // Each abbreviation used in the whole document, once per glossary entry, in alphabetical order,
  // with its expansion.
  abbreviations: {
    nodes: ['abbreviation_reference'],
    number: (node) => attrText(node.attrs.abbr),
    text: (node) => attrText(node.attrs.expansion),
    anchor: (node) => abbreviationTargetId(attrText(node.attrs.entryId)),
    identity: (node) => attrText(node.attrs.entryId),
    unique: true,
    sort: byAbbreviation,
    showPage: false,
    leader: false,
  },
} as const satisfies Record<string, ContentsKind>;

/**
 * The kinds that list every heading and captioned object in the document, front matter included,
 * with its caption or text: what numbers and names the document's elements, apart from any list.
 */
export const ELEMENT_KINDS = {
  toc: { nodes: ['heading'] },
  figures: { nodes: ['figure'], include: isCaptioned },
  tables: { nodes: ['table'], include: isCaptioned },
  codeBlocks: { nodes: ['code_block', 'linked_code_block'], include: isCaptioned },
  equations: { nodes: ['math_display'] },
} as const satisfies Record<string, ContentsKind>;

/** An entry of a list. */
export interface CatalogEntry {
  /** The kind of list it is in. */
  readonly kind: string;
  /** Its level: a heading's level, or 0 for a node a list shows at every depth. */
  readonly level: number;
  /** Its number as the stylesheet prints it, or an empty string when it has none. */
  readonly number: string;
  /** A heading's text, or an object's caption. */
  readonly text: string;
  readonly pos: number;
  /** The page it is on, counting each section as one page; the layout's page comes from `pageMap`. */
  readonly page: number;
  /** The element id its row carries (`ContentsKind.anchor`), when its kind gives one. */
  readonly anchor?: string | undefined;
  /** The element id of the node it names, which a printed row links to; none for a mark's. */
  readonly target?: string | undefined;
  /** What makes it one with another entry for `unique` (`ContentsKind.identity`), when given. */
  readonly identity?: string | undefined;
  /** Its group (`ContentsKind.group`), when its kind groups. */
  readonly group?: string | undefined;
  /** What it sorts by (`ContentsKind.order`), when given. */
  readonly order?: readonly string[] | undefined;
  /** The attributes of the citation it stands for (`ContentsKind.cites`), when given. */
  readonly cites?: Readonly<Record<string, unknown>> | undefined;
  /** Whether it is a row naming its group, over the group's entries, which names no element. */
  readonly heading?: boolean | undefined;
}

/** The parts of an entry its kind's callbacks give beside its number, text and level. */
export function entryParts(
  kind: ContentsKind,
  node: ProseMirrorNode,
  mark?: Mark,
): Pick<CatalogEntry, 'anchor' | 'identity' | 'group' | 'order' | 'cites'> {
  return {
    ...(kind.anchor ? { anchor: kind.anchor(node, mark) } : {}),
    ...(kind.identity ? { identity: kind.identity(node, mark) } : {}),
    ...(kind.group ? { group: kind.group(node, mark) } : {}),
    ...(kind.order ? { order: kind.order(node, mark) } : {}),
    ...(kind.cites ? { cites: kind.cites(node, mark) } : {}),
  };
}

/** A document's entries for each kind of list, each in reading order. */
export type DocumentCatalog = Readonly<Record<string, readonly CatalogEntry[]>>;

/** A heading's level, from 1 to 6. */
export const headingLevel = (node: ProseMirrorNode) =>
  Math.min(6, Math.max(1, Number(node.attrs.level) || 1));

// A node's text as it reads now, without the text a suggestion deletes.
function currentText(node: ProseMirrorNode): string {
  let value = '';
  node.descendants((child) => {
    if (!child.isLeaf || child.marks.some((mark) => mark.type.name === 'deletion')) return;
    value += child.isText ? (child.text ?? '') : (child.type.spec.leafText?.(child) ?? '');
  });
  return value;
}

// A node's caption when its type has one, or its text as it reads now.
function defaultText(node: ProseMirrorNode): string {
  if (!Object.hasOwn(node.type.spec.attrs ?? {}, 'caption')) return currentText(node);
  return typeof node.attrs.caption === 'string' ? node.attrs.caption : '';
}

/**
 * A node's entry in a kind of list, with the number counting gave it (null for a node the template
 * does not number), on a page.
 */
export function nodeEntry(
  [key, kind]: readonly [string, ContentsKind],
  [node, pos, numbered]: readonly [ProseMirrorNode, number, string | null],
  page: number,
): CatalogEntry {
  const target: unknown = node.attrs.dataId;
  return {
    kind: key,
    level: kind.level?.(node) ?? (node.type.name === 'heading' ? headingLevel(node) : 0),
    number: numbered ?? kind.number?.(node) ?? '',
    text: kind.text?.(node) ?? defaultText(node),
    pos,
    page,
    ...entryParts(kind, node),
    ...(typeof target === 'string' && target ? { target } : {}),
  };
}
