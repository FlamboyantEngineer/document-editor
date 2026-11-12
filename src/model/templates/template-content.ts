// A template's content as a document holds it: its stored content, with each `{{key}}` token in
// its text a live variable, and a paragraph that is only a list token, such as
// `{{table_of_contents}}`, a list of contents of its kind. `{{key}}` is the only token form. The
// images a template places from its own files are stored by asset and snapshot, never by address,
// so a host can list the assets a template needs.

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import type { StoredContent, StoredNode } from '../format/document-format.js';
import { readStoredContent } from '../format/document-format-convert.js';
import type { RegionSettings, TemplateFile } from '../format/template-format.js';

const KEY = '([A-Za-z][\\w.-]*)';
const TOKEN = new RegExp(`\\{\\{\\s*${KEY}\\s*\\}\\}`, 'g');
const ONLY_TOKEN = new RegExp(`^\\{\\{\\s*${KEY}\\s*\\}\\}$`);

/** A `{{key}}` token that ends a text, as a writer types it, with the key as its first group. */
export const TYPED_VARIABLE_TOKEN = new RegExp(`\\{\\{\\s*${KEY}\\s*\\}\\}$`);

/** The list tokens a paragraph may be, and the kind of contents each is, unless a host gives others. */
export const CONTENTS_TOKENS: Readonly<Record<string, string>> = {
  table_of_contents: 'toc',
  list_of_figures: 'figures',
  list_of_tables: 'tables',
  list_of_code: 'codeBlocks',
  list_of_equations: 'equations',
  list_of_references: 'references',
  list_of_abbreviations: 'abbreviations',
};

/** How template content is read. */
export interface TemplateContentOptions {
  /**
   * The list tokens a paragraph may be, each with the kind of contents it is, in place of
   * `CONTENTS_TOKENS`; a host adds its own kinds' tokens to them.
   */
  readonly contentsTokens?: Readonly<Record<string, string>> | undefined;
}

// A text node with its tokens as variables beside the text around them.
function expandText(node: ProseMirrorNode, schema: Schema): ProseMirrorNode[] {
  const variable = schema.nodes.template_variable;
  const text = node.text ?? '';
  if (!variable || !TOKEN.test(text)) return [node];
  TOKEN.lastIndex = 0;
  const parts: ProseMirrorNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(schema.text(text.slice(last, at), node.marks));
    parts.push(variable.create({ variableKey: match[1] ?? '' }));
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(schema.text(text.slice(last), node.marks));
  return parts;
}

// A node with the tokens of its text expanded, or a list of contents for a list token.
function expand(
  node: ProseMirrorNode,
  schema: Schema,
  tokens: Readonly<Record<string, string>>,
): ProseMirrorNode {
  const toc = schema.nodes.toc_block;
  const only = node.type.name === 'paragraph' ? ONLY_TOKEN.exec(node.textContent.trim()) : null;
  const kind = only && Object.hasOwn(tokens, only[1] ?? '') ? tokens[only[1] ?? ''] : undefined;
  if (toc && kind && node.childCount === 1) return toc.create({ tocType: kind });
  if (node.isText || node.isLeaf) return node;
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => {
    if (child.isText) children.push(...expandText(child, schema));
    else children.push(expand(child, schema, tokens));
  });
  return node.copy(Fragment.fromArray(children));
}

/** A template's stored content as a document holds it, its tokens live. */
export function readTemplateContent(
  content: unknown,
  schema: Schema,
  { contentsTokens = CONTENTS_TOKENS }: TemplateContentOptions = {},
): ProseMirrorNode[] {
  return readStoredContent(content, schema).map((node) => expand(node, schema, contentsTokens));
}

/** An asset a template's content shows. */
export interface TemplateImageRef {
  readonly fileAssetId: string;
  /** The snapshot it shows, or an empty string for the asset as it is. */
  readonly snapshotId: string;
}

/** The node types that show a stored asset, as a stored template names them. */
const IMAGE_TYPES: ReadonlySet<string> = new Set(['image', 'figure']);

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// Each piece of content a template holds, with the path validation names it by.
function* contentsOf(template: TemplateFile): Generator<readonly [string, StoredContent]> {
  const regions = function* (
    path: string,
    owner: { header?: RegionSettings | null; footer?: RegionSettings | null },
  ) {
    for (const region of ['header', 'footer'] as const) {
      const content = owner[region]?.content;
      if (content) yield [`${path}.${region}.content`, content] as const;
    }
  };
  yield* regions('template', template);
  for (const [index, section] of (template.sections ?? []).entries()) {
    const path = `template.sections[${String(index)}]`;
    if (section.content) yield [`${path}.content`, section.content] as const;
    if (section.placeholder) yield [`${path}.placeholder`, section.placeholder] as const;
    yield* regions(path, section);
  }
}

// Each image node of a run of stored content, with its path.
function* imagesOf(content: StoredContent, path: string): Generator<readonly [string, StoredNode]> {
  for (const [index, node] of content.entries()) {
    const at = `${path}[${String(index)}]`;
    if (IMAGE_TYPES.has(node.type)) yield [at, node] as const;
    if (node.content) yield* imagesOf(node.content, `${at}.content`);
  }
}

/** The assets a template's content shows, each once, in the order the template holds them. */
export function templateImageRefs(template: TemplateFile): TemplateImageRef[] {
  const refs = new Map<string, TemplateImageRef>();
  for (const [path, content] of contentsOf(template)) {
    for (const [, node] of imagesOf(content, path)) {
      const fileAssetId = text(node.attrs?.assetId);
      const snapshotId = text(node.attrs?.assetRevision);
      const key = `${fileAssetId}\u0000${snapshotId}`;
      if (fileAssetId && !refs.has(key)) refs.set(key, { fileAssetId, snapshotId });
    }
  }
  return [...refs.values()];
}

/**
 * The errors of a template's images, each naming its node: an image stored by an address rather
 * than by its asset. None when every image names its asset.
 */
export function templateImageErrors(template: TemplateFile): string[] {
  const errors: string[] = [];
  for (const [path, content] of contentsOf(template)) {
    for (const [at, node] of imagesOf(content, path)) {
      if (text(node.attrs?.src)) {
        errors.push(`${at}: a template image is stored by its asset, not by an address (src)`);
      } else if (!text(node.attrs?.assetId)) {
        errors.push(`${at}: a template image must name its asset (assetId)`);
      }
    }
  }
  return errors;
}
