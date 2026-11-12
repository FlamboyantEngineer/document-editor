// The document's marks: links and inline code that record who wrote them, the contributor mark,
// inline formatting, comment highlights, suggested insertions and deletions, and references.

import type {
  RichTextExtension,
  RichTextExtensionMark,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Mark, MarkSpec } from 'prosemirror-model';
import { marks as basicMarks } from 'prosemirror-schema-basic';
import {
  appendContributorAttrs,
  DATA_AI_SESSION_ATTR,
  DATA_CONTRIBUTOR_ATTR,
  DATA_ID_ATTR,
  type DomAttributes,
  FORMAT_CHANGE_ATTR,
  readContributorAuthorAttr,
} from './dom-attributes.js';
import { DOCUMENT_MARK_ORDER } from './node-order.js';
import { createReferenceMark } from './reference-mark.js';
import {
  type DocumentSchemaOptions,
  readTooltip,
  type ResolvedSchemaOptions,
  resolveSchemaOptions,
} from './schema-options.js';

const authorAttrs = {
  dataId: { default: null },
  dataAuthor: { default: null },
  dataAiSession: { default: null },
};

function readAuthorAttrs(dom: HTMLElement) {
  return {
    dataId: dom.getAttribute(DATA_ID_ATTR) || null,
    dataAuthor: readContributorAuthorAttr(dom),
    dataAiSession: dom.getAttribute(DATA_AI_SESSION_ATTR) || null,
  };
}

function writeAuthorAttrs(mark: Mark, attrs: DomAttributes): DomAttributes {
  if (mark.attrs.dataId) attrs[DATA_ID_ATTR] = String(mark.attrs.dataId);
  return appendContributorAttrs(attrs, mark.attrs.dataAuthor, mark.attrs.dataAiSession);
}

function link(options: ResolvedSchemaOptions): MarkSpec {
  return {
    ...basicMarks.link,
    attrs: { ...basicMarks.link.attrs, target: { default: null }, ...authorAttrs },
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute('href'),
          target: dom.getAttribute('target') === '_blank' ? '_blank' : null,
          title: readTooltip(dom, options),
          ...readAuthorAttrs(dom),
        }),
      },
    ],
    toDOM(mark: Mark) {
      const attrs: DomAttributes = { href: mark.attrs.href as string };
      if (mark.attrs.target === '_blank') {
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      if (mark.attrs.title) attrs[options.tooltipAttribute] = String(mark.attrs.title);
      return ['a', writeAuthorAttrs(mark, attrs), 0];
    },
  };
}

const code: MarkSpec = {
  ...basicMarks.code,
  attrs: { ...basicMarks.code.attrs, ...authorAttrs },
  parseDOM: ['span[data-inline-type="code"]', 'code'].map((tag) => ({
    tag,
    preserveWhitespace: 'full' as const,
    getAttrs: readAuthorAttrs,
  })),
  toDOM: (mark: Mark) => ['code', writeAuthorAttrs(mark, {}), 0],
};

const contributor: MarkSpec = {
  attrs: { dataAuthor: { default: null }, dataAiSession: { default: null } },
  inclusive: true,
  excludes: 'contributor',
  parseDOM: [
    {
      tag: 'span[data-au]',
      getAttrs: (dom: HTMLElement) => ({
        dataAuthor: readContributorAuthorAttr(dom),
        dataAiSession: dom.getAttribute(DATA_AI_SESSION_ATTR) || null,
      }),
    },
  ],
  toDOM: (mark: Mark) => [
    'span',
    appendContributorAttrs({}, mark.attrs.dataAuthor, mark.attrs.dataAiSession),
    0,
  ],
};

const strike: MarkSpec = {
  parseDOM: [
    { tag: 's' },
    {
      tag: 'del',
      // A suggested deletion is a `del` with an id; it parses as the deletion mark.
      getAttrs: (dom: HTMLElement) =>
        dom.hasAttribute('data-comment-id') || dom.hasAttribute('data-id') ? false : null,
    },
    {
      style: 'text-decoration',
      getAttrs: (value: string) => value.includes('line-through') && null,
    },
  ],
  toDOM: () => ['s', 0],
};

const underline: MarkSpec = {
  parseDOM: [
    { tag: 'u' },
    { style: 'text-decoration', getAttrs: (value: string) => value.includes('underline') && null },
  ],
  toDOM: () => ['u', 0],
};

function plainMark(tag: string): MarkSpec {
  return { parseDOM: [{ tag }], toDOM: () => [tag, 0] };
}

const commentHighlight: MarkSpec = {
  attrs: {
    dataId: { default: null },
    commentId: { default: null },
    commentState: { default: 'open' },
  },
  inclusive: false,
  excludes: '',
  parseDOM: [
    {
      tag: 'mark',
      getAttrs: (dom: HTMLElement) => {
        const commentId = dom.getAttribute('data-comment-id');
        if (!commentId) return false;
        const commentState = dom.getAttribute('data-comment-state') || 'open';
        return { dataId: dom.getAttribute('data-id') || null, commentId, commentState };
      },
    },
  ],
  toDOM(mark: Mark) {
    const attrs: DomAttributes = {};
    if (mark.attrs.dataId) attrs['data-id'] = String(mark.attrs.dataId);
    if (mark.attrs.commentId) attrs['data-comment-id'] = String(mark.attrs.commentId);
    if (mark.attrs.commentState) attrs['data-comment-state'] = String(mark.attrs.commentState);
    return ['mark', attrs, 0];
  },
};

/** A suggested insertion or deletion, which only an element with an id or comment id is. */
function suggestionMark(tag: 'ins' | 'del'): MarkSpec {
  return {
    excludes: '',
    attrs: {
      dataId: { default: null },
      dataAuthor: { default: null },
      commentId: { default: null },
    },
    parseDOM: [
      {
        tag,
        getAttrs: (dom: HTMLElement) => {
          const dataId = dom.getAttribute('data-id');
          const commentId = dom.getAttribute('data-comment-id');
          if (!commentId && !dataId) return false;
          return {
            dataId: dataId || null,
            dataAuthor: dom.getAttribute(DATA_CONTRIBUTOR_ATTR) || null,
            commentId: commentId || null,
          };
        },
      },
    ],
    toDOM(mark: Mark) {
      const attrs: DomAttributes = {};
      if (mark.attrs.dataId) attrs['data-id'] = String(mark.attrs.dataId);
      if (mark.attrs.dataAuthor) attrs[DATA_CONTRIBUTOR_ATTR] = String(mark.attrs.dataAuthor);
      if (mark.attrs.commentId) attrs['data-comment-id'] = String(mark.attrs.commentId);
      return [tag, attrs, 0];
    },
  };
}

// The formatting a format change replaced, from its stored attribute.
function readBefore(value: string | null): unknown {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** A suggested formatting change, which records the formatting it replaced (`before`). */
const formatChange: MarkSpec = {
  excludes: 'format_change',
  attrs: {
    dataId: { default: null },
    dataAuthor: { default: null },
    commentId: { default: null },
    before: { default: [] },
  },
  parseDOM: [
    {
      tag: `span[${FORMAT_CHANGE_ATTR}]`,
      priority: 60,
      getAttrs: (dom: HTMLElement) => ({
        dataId: dom.getAttribute(DATA_ID_ATTR) || null,
        dataAuthor: readContributorAuthorAttr(dom),
        commentId: dom.getAttribute('data-comment-id') || null,
        before: readBefore(dom.getAttribute(FORMAT_CHANGE_ATTR)),
      }),
    },
  ],
  toDOM(mark: Mark) {
    const attrs: DomAttributes = { [FORMAT_CHANGE_ATTR]: JSON.stringify(mark.attrs.before) };
    if (mark.attrs.dataId) attrs[DATA_ID_ATTR] = String(mark.attrs.dataId);
    if (mark.attrs.dataAuthor) attrs[DATA_CONTRIBUTOR_ATTR] = String(mark.attrs.dataAuthor);
    if (mark.attrs.commentId) attrs['data-comment-id'] = String(mark.attrs.commentId);
    return ['span', attrs, 0];
  },
};

function placed(name: keyof typeof DOCUMENT_MARK_ORDER, spec: MarkSpec): RichTextExtensionMark {
  return { name, spec, order: DOCUMENT_MARK_ORDER[name] };
}

/** Links, emphasis, strong, inline code, contributors, formatting, comments and suggestions. */
export function createMarksExtension(options?: DocumentSchemaOptions): RichTextExtension {
  const resolved = resolveSchemaOptions(options);
  return {
    name: 'marks',
    marks: [
      placed('link', link(resolved)),
      placed('em', basicMarks.em),
      placed('strong', basicMarks.strong),
      placed('code', code),
      placed('contributor', contributor),
      placed('strike', strike),
      placed('underline', underline),
      placed('superscript', plainMark('sup')),
      placed('subscript', plainMark('sub')),
      placed('comment_highlight', commentHighlight),
      placed('insertion', suggestionMark('ins')),
      placed('deletion', suggestionMark('del')),
      placed('format_change', formatChange),
      placed('reference', createReferenceMark(resolved)),
    ],
  };
}
