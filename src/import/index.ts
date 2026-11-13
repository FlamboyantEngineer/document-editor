// Bringing content in from elsewhere: documents of other formats read into stored documents,
// content composed into a template's sections, a new document of a template, and part of a stored
// document taken out. Nothing here reads the DOM, so a server imports this entry beside `./model`.

export type { MarkdownRead } from '../model/format/markdown-read.js';
export { readMarkdown } from '../model/format/markdown-read.js';
export type {
  ComposeDocumentOptions,
  CreateDocumentOptions,
} from '../model/templates/template-sections.js';
export { composeDocumentFile, createDocumentFile } from '../model/templates/template-sections.js';
export type { ImportedImage } from './docx/docx-package.js';
export type { ImportedPage } from './docx/docx-sections.js';
export type { DocxRead, DocxReadOptions } from './docx/read-docx.js';
export { readDocx } from './docx/read-docx.js';
export type { ImportFailure } from './import-error.js';
export type { ImportWarning, ImportWarningCode, ImportWarnings } from './import-warnings.js';
export { createImportWarnings } from './import-warnings.js';
export type { StoredContentTarget } from './select-content.js';
export { selectStoredContent } from './select-content.js';
export type { ZipLimits } from './zip-read.js';
export { DEFAULT_ZIP_LIMITS } from './zip-read.js';
