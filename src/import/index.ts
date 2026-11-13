// Bringing content in from elsewhere: documents of other formats read into stored documents,
// content composed into a template's sections, a new document of a template, and part of a stored
// document taken out. Nothing here reads the DOM, so a server imports this entry beside `./model`.

export type {
  ComposeDocumentOptions,
  CreateDocumentOptions,
} from '../model/templates/template-sections.js';
export { composeDocumentFile, createDocumentFile } from '../model/templates/template-sections.js';
export type { StoredContentTarget } from './select-content.js';
export { selectStoredContent } from './select-content.js';
