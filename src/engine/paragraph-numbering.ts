// Numbered paragraphs: where a template numbers paragraphs, each top-level paragraph of the body
// with text takes the next number at its level, counted through the document and its pages, and
// shown before it (`data-paragraph-number`) with its level's indentation, in every view it runs in.
// The counters start again under each heading, whose number the paragraphs show before their own,
// and where a section restarts numbering.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  advanceParagraphCounters,
  findTemplateSection,
  formatCounterValue,
  hasParagraphNumberingContent,
  headingNumberText,
  normalizeParagraphLevel,
  type NumberingAffixes,
  type NumberingStyleConfig,
  type ParagraphLevelStyle,
  paragraphNumberingIndentationStyle,
  type ResolvedNumbering,
  resolveHeadingNumbering,
  resolveParagraphLevelStyle,
  resolveParagraphNumberingConfig,
  sectionRestartsNumbering,
  type TemplateFile,
  templateScopeStyles,
} from '../model/index.js';
import { documentSectionsKey } from './document-sections.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** What a paragraph's number shows besides its own counters. */
interface ParagraphNumberOptions extends NumberingAffixes {
  /**
   * The number of the heading the paragraph is under, with the heading's trailing separator when
   * its format has one; the paragraph's counters follow it.
   */
  context?: string | undefined;
  /** Whether the context ends in the heading's own trailing separator. */
  contextSeparated?: boolean | undefined;
}

/**
 * A paragraph's number, without the space after it: the heading number it is under, if any, then
 * each of its counters in its level's format character, joined by the levels' separators, with the
 * format's trailing separator and the style's prefix and suffix.
 */
export function paragraphNumberText(
  styleConfig: NumberingStyleConfig,
  parts: readonly number[],
  { prefix = '', suffix = '', context = '', contextSeparated = false }: ParagraphNumberOptions = {},
): string {
  const { levels } = styleConfig;
  const last = levels[levels.length - 1];
  if (!last) return '';
  let text = context;
  // A heading number without a separator of its own takes the paragraph format's.
  if (context && !contextSeparated && styleConfig.hasTrailingSeparator)
    text += styleConfig.trailingSeparator;
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
  /** Its level's format and the positions of its number and text. */
  readonly levelStyle: ParagraphLevelStyle;
  /** A later part of a paragraph split over pages: at its first part's text position, unnumbered. */
  readonly continued?: true;
}

/** A numbered heading: where it is, and its number as it shows, with the space after it. */
interface NumberedHeading {
  readonly pos: number;
  readonly text: string;
}

// The counters of a scope of numbering: the headings', the paragraphs' and the heading the
// paragraphs are under, with the number it shows.
interface Counting {
  headings: number[];
  counters: number[];
  headingDepth: number;
  context: { text: string; separated: boolean };
}

const freshCounting = (): Counting => ({
  headings: [0, 0, 0, 0, 0, 0],
  counters: [],
  headingDepth: 0,
  context: { text: '', separated: false },
});

// The paragraph and heading numbering of a page section's scope; paragraphs null where its
// template numbers none.
function sectionNumbering(template: TemplateFile, section: ProseMirrorNode) {
  const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
  const styles = templateScopeStyles(template, scope);
  const config = resolveParagraphNumberingConfig(styles.paragraph);
  const numbers = (config.styleConfig?.levels.length ?? 0) > 0;
  return {
    config: numbers ? config : null,
    headings: resolveHeadingNumbering(styles),
    restarts: sectionRestartsNumbering(scope),
  };
}

// Counts a heading, as the stylesheet counts it, and makes its number the paragraphs' context. An
// unnumbered heading starts the paragraphs' counters again but gives them no number to follow.
function countHeading(
  node: ProseMirrorNode,
  counting: Counting,
  headings: readonly ResolvedNumbering[],
): string {
  const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
  counting.counters = [];
  counting.headingDepth = level;
  counting.context = { text: '', separated: false };
  if (node.attrs.numbered === false) return '';
  counting.headings[level - 1] = (counting.headings[level - 1] ?? 0) + 1;
  counting.headings.fill(0, level);
  const numbering = headings[level - 1];
  if (!numbering) return '';
  const counters = counting.headings.slice(0, level);
  const text = headingNumberText(numbering.config, counters);
  counting.context = { text, separated: numbering.config.hasTrailingSeparator };
  const shown = text && headingNumberText(numbering.config, counters, numbering);
  return shown ? `${shown} ` : '';
}

/**
 * Every numbered heading of the body, in order, with the number the stylesheet shows before it
 * and the space after it; counted as `numberedParagraphs` counts them.
 */
export function numberedHeadings(doc: ProseMirrorNode, template: TemplateFile): NumberedHeading[] {
  const found: NumberedHeading[] = [];
  let counting = freshCounting();
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    const { headings, restarts } = sectionNumbering(template, section);
    if (restarts) counting = freshCounting();
    section.descendants((node, offset) => {
      const name = node.type.name;
      if (name === 'page' || name === 'page_content') return true;
      if (name !== 'heading' || node.attrs.docTitle) return false;
      const text = countHeading(node, counting, headings);
      if (text) found.push({ pos: sectionOffset + 1 + offset, text });
      return false;
    });
  });
  return found;
}

// A split paragraph's part, by its element id and part index.
const partOf = (node: ProseMirrorNode) => {
  const id: unknown = node.attrs.dataId;
  return typeof id === 'string' && id
    ? `${id}#${String(Number(node.attrs.splitPartIndex ?? 0))}`
    : null;
};

// The part before a later part of a split paragraph.
const partBefore = (node: ProseMirrorNode) => {
  const part = Number(node.attrs.splitPartIndex ?? 0);
  return part > 0 ? `${String(node.attrs.dataId)}#${String(part - 1)}` : null;
};

/**
 * Every numbered paragraph of a document, in order: the top-level paragraphs of the body, with
 * text, in sections whose template numbers paragraphs, each after the number of the heading it is
 * under.
 */
export function numberedParagraphs(
  doc: ProseMirrorNode,
  template: TemplateFile,
): NumberedParagraph[] {
  const found: NumberedParagraph[] = [];
  // Each numbered paragraph's number by its part, which a later part shows again.
  const byPart = new Map<string, NumberedParagraph>();
  let counting = freshCounting();
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    const { config, headings, restarts } = sectionNumbering(template, section);
    if (restarts) counting = freshCounting();
    section.descendants((node, offset) => {
      const name = node.type.name;
      if (name === 'page' || name === 'page_content') return true;
      if (name === 'heading' && !node.attrs.docTitle) countHeading(node, counting, headings);
      if (name !== 'paragraph' || !config) return false;
      // A later part of a paragraph split over pages keeps its first part's text position, shows
      // no number and counts nothing again (DOCE-NUMBERING-6.1).
      const before = partBefore(node);
      const first = before === null ? undefined : byPart.get(before);
      if (first) {
        found.push({ ...first, pos: sectionOffset + 1 + offset, continued: true });
        const key = partOf(node);
        if (key) byPart.set(key, first);
        return false;
      }
      if (!hasParagraphNumberingContent(node)) return false;
      const level = normalizeParagraphLevel(node.attrs.paragraphLevel);
      const levelStyle = resolveParagraphLevelStyle(config, level, counting.headingDepth);
      const parts = advanceParagraphCounters(counting.counters, level);
      const { context } = counting;
      const text = levelStyle.styleConfig
        ? paragraphNumberText(levelStyle.styleConfig, parts, {
            ...config,
            context: context.text,
            contextSeparated: context.separated,
          })
        : '';
      if (text) {
        const style = paragraphNumberingIndentationStyle(levelStyle, { level, label: text });
        const numbered = { pos: sectionOffset + 1 + offset, level, text, style, levelStyle };
        found.push(numbered);
        const key = partOf(node);
        if (key) byPart.set(key, numbered);
      }
      return false;
    });
  });
  return found;
}

function decorate(doc: ProseMirrorNode, template: TemplateFile): DecorationSet {
  const numbered = numberedParagraphs(doc, template);
  const decorations = numbered.map(({ pos, level, text, style, continued }) => {
    const node = doc.nodeAt(pos);
    const attrs: Record<string, string> = {
      'data-paragraph-number': continued ? '' : text,
      'data-paragraph-level': String(level),
    };
    if (continued) attrs['data-paragraph-continued'] = 'true';
    if (style) attrs.style = style;
    return Decoration.node(pos, pos + (node?.nodeSize ?? 0), attrs);
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Whether a change only types or deletes text and leaves every block it types in earning a number
 * as before (DOCE-NUMBERING-3.3): the numbers stay, so the plugin skips its walk over the document.
 */
export function keepsNumbering(tr: Transaction): boolean {
  if (!isInlineTextOnly(tr)) return false;
  return tr.steps.every((step, index) => {
    const before = tr.docs[index];
    const after = tr.docs[index + 1] ?? tr.doc;
    if (!before || !(step instanceof ReplaceStep)) return false;
    const block = before.resolve(step.from).parent;
    const typed = after.resolve(step.getMap().map(step.from)).parent;
    return hasParagraphNumberingContent(block) === hasParagraphNumberingContent(typed);
  });
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
 * template, which restyles the sections. Typing that leaves every block earning a number as before
 * keeps the numbers (`keepsNumbering`).
 */
export function createParagraphNumbering({
  template,
}: ParagraphNumberingOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: paragraphNumberingKey,
    state: {
      init: (_config, state) => decorate(state.doc, template()),
      apply: (tr, value) => {
        if (tr.getMeta(paragraphNumberingKey) || tr.getMeta(documentSectionsKey))
          return decorate(tr.doc, template());
        if (!tr.docChanged) return value;
        return keepsNumbering(tr) ? value.map(tr.mapping, tr.doc) : decorate(tr.doc, template());
      },
    },
    props: { decorations: (state) => paragraphNumberingKey.getState(state) ?? null },
  });
}
