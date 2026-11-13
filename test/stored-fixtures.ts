// The regression set's stored documents and templates (`test/fixtures/documents`), read from disk
// for tests that run in Node.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DocumentFile, resolveTemplateFile, type TemplateFile } from '../src/model/index.js';

const documents = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/documents');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** A stored document of the regression set, by its name. */
export function readRegressionDocument(name: string): DocumentFile {
  return readJson(join(documents, `${name}.json`)) as DocumentFile;
}

/** A template of the regression set, by its id, resolved with the parents it inherits. */
export function readRegressionTemplate(id: string): TemplateFile {
  const load = (each: string) =>
    readJson(join(documents, 'templates', `${each}.json`)) as TemplateFile;
  return resolveTemplateFile(load(id), { loadTemplate: load });
}
