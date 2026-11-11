// The document schema: every built-in node and mark type, assembled with a host's own extensions
// into one schema. It reads no DOM at build time, so a server builds the same schema as the editor,
// and a stored document reads the same on both.

import {
  createRichTextKit,
  type RichTextExtension,
  type RichTextKit,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Schema } from 'prosemirror-model';
import { blockLayoutNodesExtension } from './block-layout-nodes.js';
import { codeNodesExtension } from './code-nodes.js';
import { coreNodesExtension } from './core-nodes.js';
import { elementAttributesExtension } from './element-attributes.js';
import { createFigureNodesExtension } from './figure-nodes.js';
import { createFootnoteNodesExtension } from './footnote-nodes.js';
import { createInlineAtomNodesExtension } from './inline-atom-nodes.js';
import { createMarksExtension } from './marks.js';
import { mathNodesExtension } from './math-nodes.js';
import { createPageNodesExtension } from './page-nodes.js';
import type { DocumentSchemaOptions } from './schema-options.js';
import { scriptNodesExtension } from './script-nodes.js';
import { tableNodesExtension } from './table-nodes.js';
import { templateNodesExtension } from './template-nodes.js';

/** What a document schema is built from. */
export interface DocumentKitOptions<C = unknown> {
  /** The host's choices for the schema's rendered output. */
  schema?: DocumentSchemaOptions | undefined;
  /**
   * The host's own extensions: node and mark types at free ordinals, refinements of built-in
   * types, plugins and views. They follow the built-in extensions.
   */
  extensions?: readonly RichTextExtension<C>[] | undefined;
}

/**
 * The built-in extensions, in registration order. The element attributes come first among the
 * refinements, so a host's refinement of a type sees them.
 */
export function createDocumentSchemaExtensions(
  options?: DocumentSchemaOptions,
): RichTextExtension[] {
  return [
    coreNodesExtension,
    templateNodesExtension,
    createPageNodesExtension(options),
    createFootnoteNodesExtension(options),
    blockLayoutNodesExtension,
    codeNodesExtension,
    createFigureNodesExtension(options),
    tableNodesExtension,
    mathNodesExtension,
    createInlineAtomNodesExtension(options),
    scriptNodesExtension,
    createMarksExtension(options),
    elementAttributesExtension,
  ];
}

/** The document kit: its schema, with the plugins and views of every extension. */
export function createDocumentKit<C = unknown>(
  options: DocumentKitOptions<C> = {},
): RichTextKit<C> {
  const builtIn = createDocumentSchemaExtensions(options.schema) as RichTextExtension<C>[];
  return createRichTextKit([...builtIn, ...(options.extensions ?? [])]);
}

/** The document schema alone. */
export function createDocumentSchema<C = unknown>(options: DocumentKitOptions<C> = {}): Schema {
  return createDocumentKit(options).schema;
}
