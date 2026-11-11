// The stored document format: a JSON tree of the document's content. It holds sections, blocks and
// inline content only, never pages, split parts or rendered text, so a server reads it without the
// editor, and the editor's own structure can change without changing what is stored.
//
// Each node is `{ type, attrs?, content?, text?, marks? }`, as in ProseMirror's JSON, with the
// stored names below. An attribute at its default is left out.

/** The current document format version. */
export const DOCUMENT_FORMAT_VERSION = 1;

/** A stored mark. */
export interface StoredMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** A stored node. */
export interface StoredNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: StoredNode[];
  /** A text node's text. */
  text?: string;
  /** A text node's marks. */
  marks?: StoredMark[];
}

/** A run of stored blocks or inline nodes. */
export type StoredContent = StoredNode[];

/** A section of a stored document. */
export interface StoredSection {
  /** The template section it is, by name; none for content outside the template's sections. */
  name?: string | null;
  content: StoredContent;
}

/** A stored document. */
export interface DocumentFile {
  formatVersion: typeof DOCUMENT_FORMAT_VERSION;
  /** The id of the template the document uses. */
  template?: string | null;
  sections: StoredSection[];
}

/** How a schema type is stored: its stored name and its attributes' stored names. */
export interface StoredTypeMapping {
  type: string;
  /** Each schema attribute's stored name, or null when it is not stored. */
  attrs?: Readonly<Record<string, string | null>>;
}

// Every element's identity, authorship and review markers; split parts are layout, not content.
const ELEMENT_ATTRS: Readonly<Record<string, string | null>> = Object.freeze({
  dataId: 'id',
  dataAuthor: 'author',
  dataAiSession: 'aiSession',
  splitPartIndex: null,
  orphanedListContinuation: null,
  suggestionSplitKind: 'suggestionKind',
  suggestionSplitId: 'suggestionId',
});

const CAPTION_ATTRS = { caption: 'caption', captionEnabled: 'captionEnabled' };
const CELL_ATTRS = {
  colspan: 'colspan',
  rowspan: 'rowspan',
  colwidth: 'colwidth',
  textAlign: 'align',
  verticalAlign: 'verticalAlign',
  rowHeight: 'rowHeight',
  textColor: 'color',
  backgroundColor: 'background',
};

/** The stored name and attributes of each built-in node type that is stored as a node. */
export const STORED_NODE_TYPES: Readonly<Record<string, StoredTypeMapping>> = Object.freeze({
  paragraph: { type: 'paragraph', attrs: { className: 'style', paragraphLevel: 'level' } },
  heading: { type: 'heading', attrs: { level: 'level', docTitle: 'title', className: 'style' } },
  blockquote: { type: 'blockquote' },
  page_break: { type: 'pageBreak' },
  horizontal_rule: { type: 'rule' },
  hard_break: { type: 'lineBreak' },
  text: { type: 'text' },
  bullet_list: { type: 'bulletList' },
  ordered_list: { type: 'orderedList', attrs: { order: 'start' } },
  list_item: { type: 'listItem' },
  code_block: {
    type: 'codeBlock',
    attrs: {
      language: 'language',
      ...CAPTION_ATTRS,
      codeBlockContinued: null,
      codeLineStart: null,
    },
  },
  linked_code_block: {
    type: 'linkedCode',
    attrs: {
      url: 'url',
      language: 'language',
      code: 'code',
      startLine: 'startLine',
      codeBlockContinued: null,
    },
  },
  figure: {
    type: 'figure',
    attrs: {
      figureType: 'kind',
      objectLayout: 'layout',
      src: 'src',
      fileAssetId: 'assetId',
      snapshotId: 'assetRevision',
      alt: 'alt',
      ...CAPTION_ATTRS,
      width: 'width',
      height: 'height',
    },
  },
  image: {
    type: 'image',
    attrs: {
      src: 'src',
      alt: 'alt',
      title: 'title',
      templateAssetImage: null,
      templateFileId: 'assetId',
      templateSnapshotId: 'assetRevision',
      templateImageName: 'name',
      templateImageMimeType: 'mediaType',
      templateImageWidth: 'width',
      templateImageHeight: 'height',
      templateImageNaturalWidth: 'naturalWidth',
      templateImageNaturalHeight: 'naturalHeight',
      templateImageConstrain: 'constrain',
      templateImageAlignment: 'alignment',
      imageStyle: 'style',
    },
  },
  table: {
    type: 'table',
    attrs: {
      tableBorderClass: 'border',
      objectLayout: 'layout',
      ...CAPTION_ATTRS,
      captionDataId: 'captionId',
    },
  },
  table_row: { type: 'tableRow' },
  table_cell: { type: 'tableCell', attrs: CELL_ATTRS },
  table_header: { type: 'tableHeader', attrs: CELL_ATTRS },
  toc_block: {
    type: 'contents',
    attrs: {
      tocType: 'kind',
      minLevel: 'depth',
      refFilter: 'referenceFilter',
      entryStart: null,
      entryEnd: null,
      showTitle: null,
    },
  },
  layout_section: { type: 'columns', attrs: { preset: 'preset' } },
  layout_column: { type: 'column' },
  script_block: {
    type: 'script',
    attrs: { script: 'source', refreshPolicy: 'refresh', renderedAt: 'renderedAt' },
  },
  dynamic_template: {
    type: 'templateBlock',
    attrs: { templateHtml: 'source', renderedHtml: null, trackedKeys: 'keys' },
  },
  template_variable: { type: 'variable', attrs: { variableKey: 'key' } },
  mention: { type: 'mention', attrs: { userId: 'person', label: 'label' } },
  signature: {
    type: 'signature',
    attrs: {
      userId: 'person',
      displayName: 'label',
      vector: 'vector',
      signatureRevisionId: 'revision',
    },
  },
  footnote_reference: {
    type: 'footnote',
    attrs: { footnoteId: 'id', footnoteNumber: null, dataId: 'elementId' },
  },
  math_inline: { type: 'math' },
  math_display: { type: 'mathBlock' },
  abbreviation_reference: {
    type: 'abbreviation',
    attrs: { entryId: 'entry', display: 'display', abbr: 'abbreviation', expansion: 'expansion' },
  },
});

/** The stored name and attributes of each built-in mark type. */
export const STORED_MARK_TYPES: Readonly<Record<string, StoredTypeMapping>> = Object.freeze({
  strong: { type: 'bold' },
  em: { type: 'italic' },
  underline: { type: 'underline' },
  strike: { type: 'strike' },
  superscript: { type: 'superscript' },
  subscript: { type: 'subscript' },
  code: { type: 'code' },
  link: { type: 'link', attrs: { href: 'href', title: 'title', target: 'target' } },
  contributor: { type: 'contributor' },
  comment_highlight: { type: 'comment', attrs: { commentId: 'thread', commentState: 'state' } },
  insertion: { type: 'insertion', attrs: { commentId: 'thread' } },
  deletion: { type: 'deletion', attrs: { commentId: 'thread' } },
  reference: {
    type: 'reference',
    attrs: {
      refType: 'referenceType',
      targetId: 'target',
      subTarget: 'subTarget',
      includeRevision: 'includeRevision',
      broken: 'broken',
      referenceBaseline: 'baseline',
      libraryRevisionId: 'targetRevision',
      libraryLabel: 'targetLabel',
      docPublisher: 'publisher',
      docNumber: 'number',
      docRevision: 'revision',
      docTitle: 'title',
      docAuthors: 'authors',
      docPages: 'pages',
    },
  },
});

/** A stored attribute name: the type's own, else an element attribute's, else the schema name. */
export function storedAttrName(
  mapping: StoredTypeMapping | undefined,
  name: string,
): string | null {
  if (mapping?.attrs && Object.hasOwn(mapping.attrs, name)) return mapping.attrs[name] ?? null;
  if (Object.hasOwn(ELEMENT_ATTRS, name)) return ELEMENT_ATTRS[name] ?? null;
  return name;
}

/** The schema attribute a stored attribute names; null when the type stores no such attribute. */
export function schemaAttrName(
  mapping: StoredTypeMapping | undefined,
  stored: string,
  schemaAttrs: readonly string[],
): string | null {
  return schemaAttrs.find((name) => storedAttrName(mapping, name) === stored) ?? null;
}

/** The LaTeX source of stored math, inline or a block, which the format keeps in `source`. */
export function storedMathSource(node: StoredNode): string {
  const source = node.attrs?.source;
  return typeof source === 'string' ? source : '';
}
