// The numbered things a document lists in its contents: its headings, figures, tables, code blocks
// and equations in reading order, each with its number as the stylesheet prints it, its text, its
// position and its page.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import { headingNumberText, objectNumberText } from '../numbering/numbering-text.js';
import {
  NUMBERED_OBJECT_KINDS,
  type NumberedObjectKind,
  type ObjectNumbering,
  type ResolvedNumbering,
  resolveHeadingNumbering,
  resolveObjectNumbering,
} from '../templates/template-numbering.js';
import { templateScopeStyles } from '../templates/template-properties.js';
import { sectionRestartsNumbering } from '../templates/template-scopes.js';
import { findTemplateSection } from '../templates/template-sections.js';

/** A numbered heading or object of a document. */
export interface CatalogEntry {
  readonly kind: 'heading' | NumberedObjectKind;
  /** A heading's level; 0 for an object. */
  readonly level: number;
  /** Its number as the stylesheet prints it, or an empty string when it has none. */
  readonly number: string;
  /** A heading's text, or an object's caption. */
  readonly text: string;
  readonly pos: number;
  /** The page it is on, counted through the document from 1. */
  readonly page: number;
}

/** A document's numbered headings and objects, each kind in reading order. */
export type DocumentCatalog = Readonly<
  Record<'heading' | NumberedObjectKind, readonly CatalogEntry[]>
>;

/** The node types each object kind numbers. */
const OBJECT_TYPES: Readonly<Record<string, NumberedObjectKind>> = {
  figure: 'figure',
  table: 'table',
  code_block: 'codeBlock',
  linked_code_block: 'codeBlock',
  math_display: 'equation',
};

interface Scope {
  readonly headings: readonly ResolvedNumbering[];
  readonly objects: Readonly<Record<NumberedObjectKind, ObjectNumbering>>;
}

interface Counting {
  scope: Scope;
  headings: number[];
  objects: Record<NumberedObjectKind, number>;
  page: number;
  readonly catalog: Record<'heading' | NumberedObjectKind, CatalogEntry[]>;
}

function scopeOf(template: TemplateFile, section: TemplateSection | null): Scope {
  const styles = templateScopeStyles(template, section);
  const objects = Object.fromEntries(
    NUMBERED_OBJECT_KINDS.map((kind) => [kind, resolveObjectNumbering(styles, kind)]),
  ) as Record<NumberedObjectKind, ObjectNumbering>;
  return { headings: resolveHeadingNumbering(styles), objects };
}

const zeroObjects = (): Record<NumberedObjectKind, number> => ({
  figure: 0,
  table: 0,
  codeBlock: 0,
  equation: 0,
});

// A later part of a split block, which its first part already counted.
const isContinuation = (node: ProseMirrorNode) =>
  Number(node.attrs.splitPartIndex) > 0 || node.attrs.codeBlockContinued === true;

// Whether an object takes a number: a table only with its caption, as the stylesheet counts.
function counts(node: ProseMirrorNode, kind: NumberedObjectKind): boolean {
  if (isContinuation(node)) return false;
  return kind !== 'table' || node.attrs.captionEnabled !== false;
}

function countHeading(node: ProseMirrorNode, pos: number, counting: Counting) {
  const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
  counting.headings[level - 1] = (counting.headings[level - 1] ?? 0) + 1;
  counting.headings.fill(0, level);
  for (const kind of NUMBERED_OBJECT_KINDS) {
    if (counting.scope.objects[kind].restartLevel === level) counting.objects[kind] = 0;
  }
  const numbering = counting.scope.headings[level - 1];
  const number = numbering
    ? headingNumberText(numbering.config, counting.headings.slice(0, level), numbering)
    : '';
  counting.catalog.heading.push({
    kind: 'heading',
    level,
    number,
    text: node.textContent,
    pos,
    page: counting.page,
  });
}

function countObject(node: ProseMirrorNode, pos: number, counting: Counting) {
  const kind = OBJECT_TYPES[node.type.name];
  if (!kind || !counts(node, kind)) return;
  counting.objects[kind] += 1;
  const numbering = counting.scope.objects[kind];
  const number = numbering.config.levels.length
    ? objectNumberText(
        numbering.config,
        { count: counting.objects[kind], headingCounters: counting.headings },
        {
          prefix: numbering.prefix,
          suffix: numbering.suffix,
          headingNumbering: counting.scope.headings.map((heading) => heading.config),
          captionLabel: kind !== 'equation',
        },
      )
    : '';
  const caption = typeof node.attrs.caption === 'string' ? node.attrs.caption : '';
  counting.catalog[kind].push({ kind, level: 0, number, text: caption, pos, page: counting.page });
}

function countBlocks(content: ProseMirrorNode, start: number, counting: Counting) {
  content.descendants((node, offset) => {
    const pos = start + offset;
    if (node.type.name === 'heading') {
      if (!isContinuation(node)) countHeading(node, pos, counting);
      return false;
    }
    countObject(node, pos, counting);
    return !node.isTextblock;
  });
}

/**
 * The numbered headings and objects of a document under a resolved template, numbered as its
 * stylesheet numbers them: each section by its own scope, restarting where the section does.
 */
export function catalogDocument(doc: ProseMirrorNode, template: TemplateFile): DocumentCatalog {
  const counting: Counting = {
    scope: scopeOf(template, null),
    headings: [0, 0, 0, 0, 0, 0],
    objects: zeroObjects(),
    page: 0,
    catalog: { heading: [], figure: [], table: [], codeBlock: [], equation: [] },
  };
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
    counting.scope = scopeOf(template, scope);
    if (sectionRestartsNumbering(scope)) {
      counting.headings = [0, 0, 0, 0, 0, 0];
      counting.objects = zeroObjects();
    }
    section.forEach((page, pageOffset) => {
      counting.page += 1;
      page.forEach((region, regionOffset) => {
        if (region.type.name !== 'page_content') return;
        countBlocks(region, sectionOffset + pageOffset + regionOffset + 3, counting);
      });
    });
  });
  return counting.catalog;
}
