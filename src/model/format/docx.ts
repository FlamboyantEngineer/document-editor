// A stored document as a word processing document (Office Open XML), faithful to its template: the
// template's styles, heading and paragraph numbering, each section's page size, orientation and
// margins with its page header and footer, lists on the template's bullets and numbers, tables,
// footnotes numbered as the template numbers them, and the comment threads the host passes. Its
// suggestions are accepted or rejected by the writers' rule. The parts are written by the modules
// in `docx/`, by the style ids and numbering names a reader shares (FORMAT §5).

import { BASE_TEMPLATE } from '../templates/base-template.js';
import type { DocumentFile, StoredSection } from './document-format.js';
import { writeBlocks } from './docx/blocks.js';
import { createWordComments, type WordCommentOptions, writeCommentParts } from './docx/comments.js';
import { type Counting, startSectionCounting } from './docx/counting.js';
import { writeFootnotesPart, writeSettingsPart } from './docx/notes.js';
import { createWordNumbering, writeNumberingPart } from './docx/numbering.js';
import {
  CONTENT_TYPES,
  linkRelationships,
  type PackagePart,
  type PartRelationship,
  RELATIONSHIP_KINDS,
  writeContentTypes,
  writeRelationships,
} from './docx/package.js';
import { writeRegionPart } from './docx/regions.js';
import {
  endSection,
  resolveSectionScope,
  type SectionParts,
  sectionProperties,
  type SectionScope,
} from './docx/sections.js';
import { writeStylesPart } from './docx/styles.js';
import { WORD_NAMESPACES, XML_DECLARATION } from './docx/word-xml.js';
import type { Writing } from './docx/writing.js';
import type { SuggestionsMode } from './left-out.js';
import type { TemplateFile } from './template-format.js';
import { mergeTemplateFiles } from './template-format-resolve.js';
import type { WriterValues } from './writer-values.js';
import { writeZip } from './zip.js';

export type { WordCommentEntry, WordCommentOptions, WordCommentThread } from './docx/comments.js';

/** How `writeDocx` writes a document. */
export interface DocxOptions {
  /** The resolved template, whose styles, numbering, pages and regions the document takes. */
  readonly template?: TemplateFile | undefined;
  /** Whether the suggestions are written as if accepted (the default) or rejected. */
  readonly suggestions?: SuggestionsMode | undefined;
  /** The values of the variables the document names, such as `document.title`, and its assets. */
  readonly values?: WriterValues | undefined;
  /** The comment threads the document anchors, from the host's comment store, with authors' names. */
  readonly comments?: WordCommentOptions | undefined;
}

interface WrittenSection {
  readonly body: string;
  readonly scope: SectionScope;
  readonly writing: Writing;
}

/** The written parts and the document part's relationships to them. */
interface Parts {
  readonly parts: PackagePart[];
  readonly relationships: PartRelationship[];
}

function writeSections(file: DocumentFile, template: TemplateFile, options: DocxOptions) {
  const suggestions = options.suggestions ?? 'accepted';
  const numbering = createWordNumbering();
  const content = file.sections.flatMap((section) => section.content);
  const shared = {
    suggestions,
    values: options.values ?? {},
    links: [],
    footnotes: [],
    footnoteLinks: [],
    comments: createWordComments(content, { ...options.comments, suggestions }),
    structural: true,
  };
  let counting: Counting | null = null;
  const sections = file.sections.map((section: StoredSection): WrittenSection => {
    const scope = resolveSectionScope(template, section);
    counting = startSectionCounting(
      counting,
      { template, section: scope.templateSection },
      numbering,
    );
    const writing: Writing = { ...shared, counting };
    return { body: writeBlocks(section.content, writing), scope, writing };
  });
  return { sections, numbering, shared };
}

// Each section's header and footer parts, one part for each distinct content, once any has one.
function regionParts(sections: readonly WrittenSection[], parts: Parts): SectionParts[] {
  const has = sections.some(({ scope }) => scope.header.length || scope.footer.length);
  if (!has) return sections.map(() => ({}));
  const written = new Map<string, string>();
  const partOf = (kind: 'header' | 'footer', section: WrittenSection) => {
    const key = `${kind}:${JSON.stringify(section.scope[kind])}`;
    const known = written.get(key);
    if (known) return known;
    const id = `rId${kind === 'header' ? 'Header' : 'Footer'}${String(written.size + 1)}`;
    const path = `word/${kind}${String(written.size + 1)}.xml`;
    const region = writeRegionPart(kind, section.scope[kind], section.writing);
    parts.parts.push({ path, type: CONTENT_TYPES[kind], data: region.data });
    parts.parts.push({
      path: path.replace('word/', 'word/_rels/').replace(/\.xml$/, '.xml.rels'),
      type: '',
      data: writeRelationships(linkRelationships(region.links)),
    });
    parts.relationships.push({ id, kind: RELATIONSHIP_KINDS[kind], target: path.slice(5) });
    written.set(key, id);
    return id;
  };
  return sections.map((section) => ({
    header: partOf('header', section),
    footer: partOf('footer', section),
  }));
}

// A part the document relates to, with its relationship.
function addPart(parts: Parts, part: { kind: keyof typeof CONTENT_TYPES; data: string }) {
  const target = `${part.kind}.xml`;
  parts.parts.push({ path: `word/${target}`, type: CONTENT_TYPES[part.kind], data: part.data });
  parts.relationships.push({
    id: `rId${part.kind.charAt(0).toUpperCase()}${part.kind.slice(1)}`,
    kind: RELATIONSHIP_KINDS[part.kind],
    target,
  });
}

/** A stored document as the bytes of a word processing document (`.docx`). */
export function writeDocx(file: DocumentFile, options: DocxOptions = {}): Uint8Array {
  const template = options.template
    ? mergeTemplateFiles(BASE_TEMPLATE, options.template)
    : BASE_TEMPLATE;
  const { sections, numbering, shared } = writeSections(file, template, options);
  const parts: Parts = { parts: [], relationships: [] };
  const regions = regionParts(sections, parts);
  const body = sections
    .map((section, index) => {
      const properties = sectionProperties(section.scope.page, regions[index]);
      return index < sections.length - 1
        ? endSection(section.body, properties)
        : section.body + properties;
    })
    .join('');
  addPart(parts, { kind: 'styles', data: writeStylesPart(template) });
  addPart(parts, { kind: 'numbering', data: writeNumberingPart(numbering) });
  const names = file.sections.map((section) => section.name ?? '');
  addPart(parts, { kind: 'settings', data: writeSettingsPart(template.footnotes, names) });
  addPart(parts, { kind: 'footnotes', data: writeFootnotesPart(shared.footnotes) });
  const comments = writeCommentParts(shared.comments);
  if (comments) {
    addPart(parts, { kind: 'comments', data: comments.comments });
    addPart(parts, { kind: 'commentsExtended', data: comments.extended });
  }
  const document = `${XML_DECLARATION}<w:document ${WORD_NAMESPACES}><w:body>${body}</w:body></w:document>`;
  const main = { path: 'word/document.xml', type: CONTENT_TYPES.document, data: document };
  const typed = [main, ...parts.parts].filter((part) => part.type);
  return writeZip(
    [
      { path: '[Content_Types].xml', data: writeContentTypes(typed) },
      {
        path: '_rels/.rels',
        data: writeRelationships([
          { id: 'rId1', kind: RELATIONSHIP_KINDS.document, target: 'word/document.xml' },
        ]),
      },
      main,
      ...parts.parts,
      {
        path: 'word/_rels/document.xml.rels',
        data: writeRelationships([...parts.relationships, ...linkRelationships(shared.links)]),
      },
      {
        path: 'word/_rels/footnotes.xml.rels',
        data: writeRelationships(linkRelationships(shared.footnoteLinks)),
      },
    ].map(({ path, data }) => ({ path, data })),
  );
}
