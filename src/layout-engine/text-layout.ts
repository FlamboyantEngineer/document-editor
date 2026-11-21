// The text layout engine: a text block's lines from its template typography, without the DOM.
// The editor, the viewer and print read the same line tables, so a block breaks its lines in the
// same places wherever it is drawn (DOCE-PAGINATION-9).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile } from '../model/format/template-format.js';
import type { TextMeasurement } from '../model/pagination/text-split.js';
import type { FontStacks } from '../model/templates/template-text-properties.js';
import type { LineTable } from './line-table.js';
import { createLineCache, layoutLines } from './lines.js';
import { buildRuns, type MeasureAtom } from './runs.js';
import { type BlockTypography, blockTypography, firstFamily } from './typography.js';

/** What the engine lays text out from. */
export interface TextLayoutOptions {
  readonly template: TemplateFile;
  /** The font stacks of the families the host serves itself (`FontStacks`). */
  readonly fontStacks?: FontStacks | undefined;
  /** The document's language, which line breaking follows. */
  readonly language?: string | undefined;
  /** Whether a family is one the document's fonts serve; a block in another is refused. */
  readonly isFontServed?: ((family: string) => boolean) | undefined;
  /** Sizes the inline atoms the engine does not lay out as text. */
  readonly measureAtom?: MeasureAtom | undefined;
}

/** Where a text block is laid out. */
export interface TextBlockPlace {
  /** The width the block gets, its padding included. */
  readonly width: number;
  /** The template section the block is in; the template's own scope when absent. */
  readonly scope?: string | null | undefined;
  /** Text drawn before the content on its first line, such as a heading's number and its space. */
  readonly prefix?: string | undefined;
}

/** A block's line table, or why the engine cannot lay it out. */
export type TextBlockLayout =
  | { readonly ok: true; readonly table: LineTable }
  | { readonly ok: false; readonly reason: string };

/** A text layout engine for one template, language and set of fonts. */
export interface TextLayout {
  /** A text block's typography in a scope. */
  readonly typography: (node: ProseMirrorNode, scope?: string | null) => BlockTypography;
  /** A text block's lines at a width. */
  readonly layoutText: (node: ProseMirrorNode, place: TextBlockPlace) => TextBlockLayout;
}

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'code_block']);

function hasCode(node: ProseMirrorNode): boolean {
  let found = false;
  node.forEach((child) => {
    found ||= child.marks.some((mark) => mark.type.name === 'code');
  });
  return found;
}

function unservedFamily(
  node: ProseMirrorNode,
  typography: BlockTypography,
  isFontServed: (family: string) => boolean,
): string | null {
  const families = [typography.font.family];
  if (hasCode(node)) families.push(typography.codeFamily);
  return families.map(firstFamily).find((family) => !isFontServed(family)) ?? null;
}

/** A text layout engine. Prepared text is kept between calls, so laying a block out again is cheap. */
export function createTextLayout(options: TextLayoutOptions): TextLayout {
  const cache = createLineCache(options.language);
  const typography = (node: ProseMirrorNode, scope?: string | null) =>
    blockTypography(node, { template: options.template, fontStacks: options.fontStacks, scope });
  return {
    typography,
    layoutText(node, place) {
      if (!TEXT_BLOCKS.has(node.type.name))
        return { ok: false, reason: `not a text block: ${node.type.name}` };
      const style = typography(node, place.scope);
      const unserved = options.isFontServed
        ? unservedFamily(node, style, options.isFontServed)
        : null;
      if (unserved) return { ok: false, reason: `font not served: ${unserved}` };
      const runs = buildRuns({
        node,
        typography: style,
        prefix: place.prefix,
        measureAtom: options.measureAtom,
      });
      if (!runs.ok) return runs;
      const table = layoutLines(cache, {
        runs: runs.runs,
        width: Math.max(1, place.width - 2 * style.padding),
        leading: style.leading,
        align: style.align,
        padding: style.padding,
      });
      return { ok: true, table };
    },
  };
}

/**
 * A line table as the measurement the page packer's splitters read: the lines a range of the
 * block touches and their height. `offset` is where the fragment starts in the whole block.
 */
export function lineTableMeasurement(table: LineTable, offset = 0): TextMeasurement {
  return {
    offset,
    overhead: table.overhead,
    lines: table,
    measure(from, to) {
      const touched = table.lines.filter((line) =>
        from === to
          ? line.from <= from && from < Math.max(line.to, line.from + 1)
          : line.from < to && line.to > from,
      );
      const first = touched[0];
      const last = touched.at(-1);
      return {
        height: first && last ? last.top + last.height - first.top : 0,
        lines: touched.length,
      };
    },
  };
}
