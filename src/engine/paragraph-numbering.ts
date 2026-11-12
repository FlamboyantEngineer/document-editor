// Numbered paragraphs: where a template numbers paragraphs, each top-level paragraph of the body
// with text takes the next number at its level, counted through the document and its pages, and
// shown before it (`data-paragraph-number`) with its level's indentation, in every view it runs in.
// The counters start again under each heading, and where a section restarts numbering.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  advanceParagraphCounters,
  findTemplateSection,
  formatCounterValue,
  hasParagraphNumberingContent,
  normalizeParagraphLevel,
  type NumberingAffixes,
  type NumberingStyleConfig,
  paragraphNumberingIndentationStyle,
  resolveParagraphLevelStyle,
  resolveParagraphNumberingConfig,
  sectionRestartsNumbering,
  type TemplateFile,
  templateScopeStyles,
} from '../model/index.js';
import { documentSectionsKey } from './document-sections.js';

/**
 * A paragraph's number, without the space after it: each of its counters in its level's format
 * character, joined by the levels' separators, with the format's trailing separator and the
 * style's prefix and suffix.
 */
export function paragraphNumberText(
  styleConfig: NumberingStyleConfig,
  parts: readonly number[],
  { prefix = '', suffix = '' }: NumberingAffixes = {},
): string {
  const { levels } = styleConfig;
  const last = levels[levels.length - 1];
  if (!last) return '';
  let text = '';
  parts.forEach((value, index) => {
    const level = levels[index] ?? last;
    text += formatCounterValue(value, level.token);
    if (index < parts.length - 1) text += level.separator;
  });
  if (styleConfig.hasTrailingSeparator) text += styleConfig.trailingSeparator;
  const between = prefix && !/\s$/.test(prefix) ? styleConfig.trailingSeparator : '';
  return prefix ? prefix + between + text + suffix : text + suffix;
}

/** A numbered paragraph: where it is, and the number and indentation it shows. */
export interface NumberedParagraph {
  readonly pos: number;
  readonly level: number;
  readonly text: string;
  readonly style: string;
}

// The counters of a scope of numbering, and the heading level the paragraphs are under.
interface Counting {
  counters: number[];
  headingDepth: number;
}

// The paragraph numbering of a page section's scope; null where its template numbers none.
function sectionNumbering(template: TemplateFile, section: ProseMirrorNode) {
  const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
  const config = resolveParagraphNumberingConfig(templateScopeStyles(template, scope).paragraph);
  const numbers = (config.styleConfig?.levels.length ?? 0) > 0;
  return { config: numbers ? config : null, restarts: sectionRestartsNumbering(scope) };
}

/**
 * Every numbered paragraph of a document, in order: the top-level paragraphs of the body, with
 * text, in sections whose template numbers paragraphs.
 */
export function numberedParagraphs(
  doc: ProseMirrorNode,
  template: TemplateFile,
): NumberedParagraph[] {
  const found: NumberedParagraph[] = [];
  const counting: Counting = { counters: [], headingDepth: 0 };
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    const { config, restarts } = sectionNumbering(template, section);
    if (restarts) Object.assign(counting, { counters: [], headingDepth: 0 });
    section.descendants((node, offset) => {
      const name = node.type.name;
      if (name === 'page' || name === 'page_content') return true;
      if (name === 'heading' && !node.attrs.docTitle) {
        counting.counters = [];
        counting.headingDepth = Number(node.attrs.level) || 1;
      }
      if (name !== 'paragraph' || !config) return false;
      if (!hasParagraphNumberingContent(node)) return false;
      const level = normalizeParagraphLevel(node.attrs.paragraphLevel);
      const levelStyle = resolveParagraphLevelStyle(config, level, counting.headingDepth);
      const parts = advanceParagraphCounters(counting.counters, level);
      const text = levelStyle.styleConfig
        ? paragraphNumberText(levelStyle.styleConfig, parts, config)
        : '';
      if (text) {
        const style = paragraphNumberingIndentationStyle(levelStyle, level);
        found.push({ pos: sectionOffset + 1 + offset, level, text, style });
      }
      return false;
    });
  });
  return found;
}

function decorate(doc: ProseMirrorNode, template: TemplateFile): DecorationSet {
  const decorations = numberedParagraphs(doc, template).map(({ pos, level, text, style }) => {
    const node = doc.nodeAt(pos);
    const attrs: Record<string, string> = {
      'data-paragraph-number': text,
      'data-paragraph-level': String(level),
    };
    if (style) attrs.style = style;
    return Decoration.node(pos, pos + (node?.nodeSize ?? 0), attrs);
  });
  return DecorationSet.create(doc, decorations);
}

/** Marks a transaction that numbers the paragraphs again, as after the template changed. */
export const paragraphNumberingKey = new PluginKey<DecorationSet>('paragraph-numbering');

/** How paragraph numbering reads the template. */
export interface ParagraphNumberingOptions {
  readonly template: () => TemplateFile;
}

/**
 * Numbers the paragraphs where the template numbers them (`numberedParagraphs`), in every view it
 * runs in, so the pages measure the numbers too; again after a change of the document, or of the
 * template, which restyles the sections.
 */
export function createParagraphNumbering({
  template,
}: ParagraphNumberingOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: paragraphNumberingKey,
    state: {
      init: (_config, state) => decorate(state.doc, template()),
      apply: (tr, value) =>
        tr.docChanged || tr.getMeta(paragraphNumberingKey) || tr.getMeta(documentSectionsKey)
          ? decorate(tr.doc, template())
          : value,
    },
    props: { decorations: (state) => paragraphNumberingKey.getState(state) ?? null },
  });
}
