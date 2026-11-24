// A word processing document (`.docx`) read into a stored document without the DOM or a converter
// (DOCE-IMPORT-2): its archive inflated, its XML parts parsed, and its body, sections, headers and
// footers, footnotes, comments and images read by the mapping the library's writer uses, with a
// warning for each kind of content left out. Once every block is read, cross-references are pointed
// at the blocks their bookmarks mark and typed heading numbers are taken off.

import type { CommentThread } from '../../host/comment-adapters.js';
import { createElementId } from '../../model/element-id.js';
import {
  DOCUMENT_FORMAT_VERSION,
  type DocumentFile,
  type StoredNode,
  type StoredSection,
} from '../../model/format/document-format.js';
import type { TemplateFile } from '../../model/format/template-format.js';
import { importError, type ImportFailure, isImportError } from '../import-error.js';
import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../import-warnings.js';
import { childElement, childElements, type XmlElement } from '../xml-read.js';
import { readZip } from '../zip-read.js';
import { splitAppendix } from './docx-appendix.js';
import { type BlockReading, readBlockElements, readBlocks } from './docx-blocks.js';
import {
  DEFAULT_DOCX_LIMITS,
  type DocxLimits,
  refuseLargeOutput,
  refuseNonStandardPart,
} from './docx-checks.js';
import { type DocxComments, readComments } from './docx-comments.js';
import { stripHeadingNumbers } from './docx-heading-numbers.js';
import { readInlineContent } from './docx-inline.js';
import { readNumbering } from './docx-numbering.js';
import {
  type DocxPackage,
  type DocxPart,
  type ImportedImage,
  openPackage,
  relationshipKind,
} from './docx-package.js';
import { type DocxCounts, readSummary, resolveReferences } from './docx-resolve.js';
import { type ImportedPage, readSectionPage, sectionRegionIds } from './docx-sections.js';
import { readStyles } from './docx-styles.js';

/** How `readDocx` reads a document. */
export interface DocxReadOptions {
  /** The template the document will use: custom styles it lacks are left out with a warning. */
  readonly template?: Pick<TemplateFile, 'styles'> | undefined;
  /** The `src` an embedded image is given, such as a host's upload placeholder; a `data:` URL by default. */
  readonly imageSource?: ((image: Omit<ImportedImage, 'src'>) => string) | undefined;
  /** How much the document may hold; `DEFAULT_DOCX_LIMITS` by default. */
  readonly limits?: Partial<DocxLimits> | undefined;
  /**
   * Makes the id of each tracked change's suggestion and of each comment (`comment-<id>`); eight
   * random hexadecimal digits by default.
   */
  readonly newId?: (() => string) | undefined;
  /**
   * Whether a plain paragraph beside a figure or table whose text starts with a caption label, such
   * as `Figure 2. ` or `Table A-1: `, is its caption; true by default. Word's own captions always are.
   */
  readonly textCaptions?: boolean | undefined;
  /**
   * What becomes of the document's review history: `accept` (the default) keeps its text with
   * tracked changes accepted and leaves its comments out; `keep` reads tracked changes as
   * suggestions and comments as comment threads.
   */
  readonly review?: 'accept' | 'keep' | undefined;
  /**
   * The name of the section the document's appendices go in, from the first heading in an appendix
   * or annex style, else the first top-level heading reading `Appendix` or `Annex` and a letter or
   * number, to the end (`findAppendixSection` gives a template's); none keeps them in place.
   */
  readonly appendixSection?: string | undefined;
}

/** A document read, or why it could not be. */
export type DocxRead =
  | {
      readonly ok: true;
      readonly file: DocumentFile;
      readonly warnings: ImportWarning[];
      /** The comment threads the document's comment marks name. */
      readonly comments: CommentThread[];
      /** The embedded images the document's figures and images show. */
      readonly images: ImportedImage[];
      /** Each section's page, in section order; null where the document sets none. */
      readonly pages: (ImportedPage | null)[];
      /** The text of the document's title paragraph, such as for the new document's name; null for none. */
      readonly title: string | null;
      /** How many headings, tables, images and footnotes the document holds. */
      readonly counts: DocxCounts;
    }
  | { readonly ok: false; readonly failure: ImportFailure; readonly message: string };

interface Parts {
  readonly package: DocxPackage;
  readonly main: DocxPart;
  readonly body: XmlElement;
  /** The main part's related part of a kind, such as `styles`. */
  readonly related: (kind: string) => Promise<DocxPart | null>;
}

interface Shared {
  readonly parts: Parts;
  readonly warnings: ImportWarnings;
  readonly styles: ReturnType<typeof readStyles>;
  readonly numbering: ReturnType<typeof readNumbering>;
  readonly comments: DocxComments;
  readonly keepsStyle: (key: string) => boolean;
  readonly changeMark: BlockReading['changeMark'];
  readonly keepsReview: boolean;
  readonly textCaptions: boolean;
  readonly bookmarks: Map<string, StoredNode>;
  readonly appendixHeadings: Set<StoredNode>;
  notes: (kind: 'footnote' | 'endnote', id: string) => StoredNode[] | null;
}

function readingFor(part: DocxPart, shared: Shared): BlockReading {
  return {
    part,
    styles: shared.styles,
    numbering: shared.numbering,
    warnings: shared.warnings,
    note: (kind, id) => shared.notes(kind, id),
    commentMark: shared.comments.markOf,
    changeMark: shared.changeMark,
    keepsStyle: shared.keepsStyle,
    keepsReview: shared.keepsReview,
    textCaptions: shared.textCaptions,
    bookmarks: shared.bookmarks,
    appendixHeadings: shared.appendixHeadings,
    open: { comments: [], fields: [] },
  };
}

const NOTE_SEPARATORS = new Set(['separator', 'continuationSeparator', 'continuationNotice']);

// The notes of a note part, each read as inline content, its paragraphs joined by line breaks.
function notesReader(part: DocxPart | null, shared: Shared) {
  const notes = new Map(
    childElements(part?.root)
      .filter((note) => !NOTE_SEPARATORS.has(note.attrs['w:type'] ?? ''))
      .map((note) => [note.attrs['w:id'] ?? '', note]),
  );
  return (id: string): StoredNode[] | null => {
    const note = notes.get(id);
    if (!note || !part) return null;
    const reading = { ...readingFor(part, shared), note: () => null };
    return childElements(note, 'w:p').flatMap((p, index) => [
      ...(index > 0 ? [{ type: 'lineBreak' }] : []),
      ...readInlineContent(p, reading),
    ]);
  };
}

async function openParts(
  bytes: Uint8Array,
  options: DocxReadOptions,
  warnings: ImportWarnings,
): Promise<Parts> {
  const limits = { ...DEFAULT_DOCX_LIMITS, ...options.limits };
  const archive = readZip(bytes, limits);
  const pkg = openPackage(archive, warnings, { imageSource: options.imageSource, limits });
  const main = await pkg.main();
  const [body, ...otherBodies] = childElements(main.root, 'w:body');
  if (main.root.name !== 'w:document' || !body || otherBodies.length)
    throw importError('damaged', 'The document part has an invalid root or body.');
  const related = async (kind: string) => {
    const relationship = [...main.relationships.values()].find(
      (each) => relationshipKind(each.type) === kind,
    );
    if (!relationship || relationship.external) return null;
    refuseNonStandardPart(kind, relationship.target);
    return pkg.part(relationship.target);
  };
  return { package: pkg, main, body, related };
}

// The template section names the writer lists in the settings part, in section order.
function sectionNames(settings: DocxPart | null): string[] {
  const variable = childElements(childElement(settings?.root, 'w:docVars'), 'w:docVar').find(
    (element) => element.attrs['w:name'] === 'sections',
  );
  try {
    const names: unknown = JSON.parse(variable?.attrs['w:val'] ?? '[]');
    return Array.isArray(names) ? names.map((name) => (typeof name === 'string' ? name : '')) : [];
  } catch {
    return [];
  }
}

// The body's block elements split at each section's end, with the properties that end it.
function bodySections(body: XmlElement): { elements: XmlElement[]; sectPr: XmlElement | null }[] {
  const sections: { elements: XmlElement[]; sectPr: XmlElement | null }[] = [];
  let elements: XmlElement[] = [];
  for (const element of childElements(body)) {
    if (element.name === 'w:sectPr') continue;
    elements.push(element);
    const sectPr =
      element.name === 'w:p' ? childElement(childElement(element, 'w:pPr'), 'w:sectPr') : null;
    if (sectPr) {
      sections.push({ elements, sectPr });
      elements = [];
    }
  }
  sections.push({ elements, sectPr: childElement(body, 'w:sectPr') });
  return sections;
}

async function regionContent(id: string | null, shared: Shared): Promise<StoredNode[] | null> {
  const relationship = id ? shared.parts.main.relationships.get(id) : undefined;
  const part = relationship ? await shared.parts.package.part(relationship.target) : null;
  return part ? readBlocks(part.root, readingFor(part, shared)) : null;
}

async function readSections(
  shared: Shared,
): Promise<{ sections: StoredSection[]; pages: (ImportedPage | null)[] }> {
  const names = sectionNames(await shared.parts.related('settings'));
  const reading = readingFor(shared.parts.main, shared);
  const sections: StoredSection[] = [];
  const pages: (ImportedPage | null)[] = [];
  // A section without its own header or footer continues the one before it, as in Word.
  let regions: { header: StoredNode[] | null; footer: StoredNode[] | null } = {
    header: null,
    footer: null,
  };
  for (const [index, { elements, sectPr }] of bodySections(shared.parts.body).entries()) {
    const ids = sectionRegionIds(sectPr);
    if (ids.header) shared.warnings.add('header-footer-skipped', 'header');
    if (ids.footer) shared.warnings.add('header-footer-skipped', 'footer');
    regions = {
      header: ids.header ? await regionContent(ids.header, shared) : regions.header,
      footer: ids.footer ? await regionContent(ids.footer, shared) : regions.footer,
    };
    const name = names[index];
    sections.push({
      ...(name ? { name } : {}),
      ...(regions.header ? { header: { content: regions.header } } : {}),
      ...(regions.footer ? { footer: { content: regions.footer } } : {}),
      content: stripHeadingNumbers(readBlockElements(elements, reading), shared.warnings),
    });
    const page = readSectionPage(sectPr);
    if (page) shared.warnings.add('section-layout-skipped');
    pages.push(page);
  }
  return { sections, pages };
}

// The suggestion marks of tracked changes: a fresh id for each change, the parts of one change
// (one Word id) sharing it, and the change's author as the suggestion's.
function changeMarks(newId: () => string): Shared['changeMark'] {
  const ids = new Map<string, string>();
  return (kind, change) => {
    const wordId = change.attrs['w:id'];
    let id = wordId === undefined ? undefined : ids.get(wordId);
    if (id === undefined) {
      id = newId();
      if (wordId !== undefined) ids.set(wordId, id);
    }
    const author = change.attrs['w:author'];
    return { type: kind, attrs: { id, ...(author ? { author } : {}) } };
  };
}

async function readDocument(bytes: Uint8Array, options: DocxReadOptions): Promise<DocxRead> {
  const warnings = createImportWarnings();
  const parts = await openParts(bytes, options, warnings);
  const root = async (kind: string) => (await parts.related(kind))?.root ?? null;
  const custom = options.template?.styles?.custom;
  const newId = options.newId ?? createElementId;
  const keepsReview = options.review === 'keep';
  const commentsRoot = await root('comments');
  const shared: Shared = {
    parts,
    warnings,
    styles: readStyles(await root('styles')),
    numbering: readNumbering(await root('numbering')),
    comments: readComments(
      keepsReview ? commentsRoot : null,
      await root('commentsExtended'),
      newId,
    ),
    keepsStyle: (key) => !options.template || Object.hasOwn(custom ?? {}, key),
    changeMark: changeMarks(newId),
    keepsReview,
    textCaptions: options.textCaptions !== false,
    bookmarks: new Map(),
    appendixHeadings: new Set(),
    notes: () => null,
  };
  if (!keepsReview) {
    for (const _ of childElements(commentsRoot, 'w:comment'))
      warnings.add('review-left-out', 'comment');
  }
  const footnotes = notesReader(await parts.related('footnotes'), shared);
  const endnotes = notesReader(await parts.related('endnotes'), shared);
  shared.notes = (kind, id) => (kind === 'footnote' ? footnotes(id) : endnotes(id));
  const read = await readSections(shared);
  const split = options.appendixSection
    ? splitAppendix(read.sections, shared.appendixHeadings, options.appendixSection)
    : null;
  const sections = split?.sections ?? read.sections;
  const pages = split ? split.from.map((index) => read.pages[index] ?? null) : read.pages;
  resolveReferences(sections, { bookmarks: shared.bookmarks, warnings, newId });
  const file: DocumentFile = { formatVersion: DOCUMENT_FORMAT_VERSION, sections };
  refuseLargeOutput(file, { ...DEFAULT_DOCX_LIMITS, ...options.limits });
  return {
    ok: true,
    file,
    warnings: warnings.list(),
    comments: shared.comments.threads(file),
    images: parts.package.images,
    pages,
    ...readSummary(sections),
  };
}

/**
 * A word processing document read into a stored document (DOCE-IMPORT-2.1), with its warnings,
 * comment threads, images and section pages; or, for bytes that are not such a document, a
 * damaged one or one over the limits, `{ ok: false, failure, message }`.
 */
export async function readDocx(
  bytes: Uint8Array,
  options: DocxReadOptions = {},
): Promise<DocxRead> {
  try {
    return await readDocument(bytes, options);
  } catch (error) {
    if (!isImportError(error)) throw error;
    return { ok: false, failure: error.failure, message: error.message };
  }
}
