// A later part's caption of a split table or code block, which holds no text and shows the first
// part's (`continuedText`) and its kind's continued suffix (DOCE-PAGINATION-9.11): the engine lays
// it out as a caption holding that text.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile } from '../model/format/template-format.js';
import { normalizeCaptionContinuedSuffix } from '../model/schema/caption-text.js';
import { templateScopeStyles } from '../model/templates/template-properties.js';
import { findTemplateSection } from '../model/templates/template-sections.js';

/** The template settings each repeated caption's suffix is read from. */
const SUFFIX_KINDS: Readonly<Record<string, 'table' | 'codeBlock'>> = {
  table_caption: 'table',
  code_caption: 'codeBlock',
};

interface CaptionSource {
  readonly template: TemplateFile;
  readonly scope?: string | null | undefined;
}

/**
 * The text a later part's caption shows after the first part's: its kind's continued suffix in the
 * scope, with its space, as the stylesheet draws it (`--doc-table-caption-continued`); empty for a
 * figure's caption, which no split repeats.
 */
function captionContinuedSuffix(node: ProseMirrorNode, source: CaptionSource): string {
  const kind = SUFFIX_KINDS[node.type.name];
  if (!kind) return '';
  const { template, scope } = source;
  const section = scope ? findTemplateSection(template, scope) : null;
  const suffix: unknown = templateScopeStyles(template, section)[kind]?.caption?.continuedSuffix;
  return typeof suffix === 'string' ? normalizeCaptionContinuedSuffix(suffix) : '';
}

/**
 * A later part's caption as a caption holding the text it shows, which its lines are laid out over
 * (`LineTable.text`), and that text; null for any other block.
 */
export function continuedCaption(
  node: ProseMirrorNode,
  source: CaptionSource,
): { readonly node: ProseMirrorNode; readonly text: string } | null {
  const shown: unknown = node.attrs.continuedText;
  if (typeof shown !== 'string') return null;
  const text = `${shown}${captionContinuedSuffix(node, source)}`;
  const content = text ? node.type.schema.text(text) : null;
  return { node: node.type.create({ ...node.attrs, continuedText: null }, content), text };
}
