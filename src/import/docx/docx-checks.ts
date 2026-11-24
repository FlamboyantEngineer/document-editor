// What a word processing document's package must be before the reader reads it: no macros, its
// main parts where Word puts them, and within limits that a zip archive's own do not cover: the
// size of each XML part, how deep its elements nest, and the size of the document read.

import { importError } from '../import-error.js';
import { childElements, type XmlElement } from '../xml-read.js';
import { DEFAULT_ZIP_LIMITS, type ZipLimits } from '../zip-read.js';

/** How much a word processing document may hold. */
export interface DocxLimits extends ZipLimits {
  /** The most bytes an XML part may hold. */
  readonly xmlBytes: number;
  /** The deepest an XML part's elements may nest. */
  readonly xmlDepth: number;
  /** The most bytes the document read may take, written as JSON. */
  readonly outputBytes: number;
}

/**
 * The default limits: the archive's (`DEFAULT_ZIP_LIMITS`), 10 MiB in an XML part, elements nested
 * 256 deep and 10 MiB of document read.
 */
export const DEFAULT_DOCX_LIMITS: DocxLimits = Object.freeze({
  ...DEFAULT_ZIP_LIMITS,
  xmlBytes: 10 * 1024 * 1024,
  xmlDepth: 256,
  outputBytes: 10 * 1024 * 1024,
});

const MACRO_PART = /(^|\/)vba(project|data)[^/]*$/i;
const MACRO_TYPE = /macroenabled|vbaproject|vbadata/i;

/** The entries of a package metadata part, whose tags may have prefixes. */
export function packageElements(
  root: XmlElement | null,
  name: 'Types' | 'Relationships',
  tag: string,
): XmlElement[] {
  const prefix = name === 'Types' ? 'opc-types' : 'opc-rels';
  if (root && root.name !== name && root.name !== `${prefix}:${name}`)
    throw importError('damaged', `The ${name} part is invalid.`);
  return childElements(root, root?.name === name ? tag : `${prefix}:${tag}`);
}

const namesMacroType = (elements: XmlElement[], attribute: string) =>
  elements.some((element) => MACRO_TYPE.test(element.attrs[attribute] ?? ''));

/**
 * Refuses a package with macros: a part named `vbaProject` or `vbaData`, a macro-enabled or VBA
 * content type, or a relationship of a VBA type, whatever its file is called.
 */
export async function refuseMacros(
  paths: readonly string[],
  read: (path: string) => Promise<XmlElement | null>,
): Promise<void> {
  const refuse = () => {
    throw importError('refused', 'The document holds macros.');
  };
  if (paths.some((path) => MACRO_PART.test(path))) refuse();
  const types = await read('[Content_Types].xml');
  const defaults = packageElements(types, 'Types', 'Default');
  const overrides = packageElements(types, 'Types', 'Override');
  if (namesMacroType(defaults, 'ContentType') || namesMacroType(overrides, 'ContentType')) refuse();
  for (const path of paths.filter((each) => each.endsWith('.rels'))) {
    const relationships = packageElements(await read(path), 'Relationships', 'Relationship');
    if (namesMacroType(relationships, 'Type')) refuse();
  }
}

/** Where Word puts each main part, which the reader requires. */
const STANDARD_PARTS: Readonly<Record<string, string>> = {
  officeDocument: 'word/document.xml',
  styles: 'word/styles.xml',
  numbering: 'word/numbering.xml',
  footnotes: 'word/footnotes.xml',
  endnotes: 'word/endnotes.xml',
  comments: 'word/comments.xml',
};

/** Refuses a main part, by the kind of relationship that names it, that is not where Word puts it. */
export function refuseNonStandardPart(kind: string, path: string): void {
  const standard = STANDARD_PARTS[kind];
  if (standard && path !== standard)
    throw importError('refused', `The document's ${kind} part is not at ${standard}.`);
}

/** Refuses a document read larger than the limit allows. */
export function refuseLargeOutput(file: unknown, limits: DocxLimits): void {
  const bytes = new TextEncoder().encode(JSON.stringify(file)).length;
  if (bytes > limits.outputBytes)
    throw importError(
      'too-large',
      `The document read is larger than ${String(limits.outputBytes)} bytes.`,
    );
}
