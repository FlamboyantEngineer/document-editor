// Pretext's lines for one text block of the editor: where each line starts in the block's content,
// how wide it is and how many spaces it can stretch at, from the same typography the Pretext lab
// resolves from the base template. The editor's text is `white-space: pre-wrap`, so it is laid out
// as such, and a hard break starts a run of its own.

import {
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineItem,
  walkRichInlineLineRanges,
} from '@chenglou/pretext/rich-inline';
import type { Node } from 'prosemirror-model';
import { inlineCodeFamily } from '../pretext/prediction.js';
import { font, headings, paragraph, type Typography } from '../pretext/settings.js';

/** One computed line: its start as an offset into the block's content, and what it holds. */
export interface ForcedLine {
  readonly from: number;
  readonly to: number;
  readonly width: number;
  /** Spaces between words on the line, where justified text stretches. */
  readonly spaces: number;
  /** The line ends the block or a hard break, so justified text leaves it unstretched. */
  readonly last: boolean;
}

interface Run {
  readonly items: RichInlineItem[];
  readonly offsets: number[];
  readonly start: number;
  end: number;
}

/** The typography of a paragraph or heading, or none for a block this spike leaves alone. */
export function typographyOf(node: Node): Typography | null {
  if (node.type.name === 'paragraph') return paragraph;
  if (node.type.name === 'heading') return headings[Number(node.attrs.level) - 1] ?? paragraph;
  return null;
}

function styled(base: Typography, child: Node): Typography {
  let style = base;
  for (const { type } of child.marks) {
    if (type.name === 'strong') style = { ...style, weight: 700 };
    else if (type.name === 'em') style = { ...style, italic: true };
    else if (type.name === 'code') style = { ...style, family: inlineCodeFamily };
  }
  return style;
}

function runsOf(node: Node, style: Typography): Run[] {
  let run: Run = { items: [], offsets: [], start: 0, end: 0 };
  const runs = [run];
  node.forEach((child, offset) => {
    if (child.type.name === 'hard_break') {
      run.end = offset;
      run = { items: [], offsets: [], start: offset + child.nodeSize, end: 0 };
      runs.push(run);
    } else if (child.isText) {
      run.items.push({ text: child.text ?? '', font: font(styled(style, child)) });
      run.offsets.push(offset);
    }
    // Inline atoms are outside this spike: their width is left out of the line.
  });
  run.end = node.content.size;
  return runs;
}

const spacesIn = (text: string) => (text.trimEnd().match(/ /gu) ?? []).length;

/** Each line of `node` at `width`, in order; an empty run still makes one empty line. */
export function forcedLines(node: Node, style: Typography, width: number): ForcedLine[] {
  const lines: ForcedLine[] = [];
  for (const run of runsOf(node, style)) {
    const found: Pick<ForcedLine, 'from' | 'width'>[] = [];
    if (run.items.length) {
      const prepared = prepareRichInline(run.items, { whiteSpace: 'pre-wrap' });
      walkRichInlineLineRanges(prepared, width, (range) => {
        const first = materializeRichInlineLineRange(prepared, range).fragments[0];
        found.push({
          from: (run.offsets[first?.itemIndex ?? 0] ?? run.start) + (first?.sourceStart ?? 0),
          width: range.width,
        });
      });
    }
    if (!found.length) found.push({ from: run.start, width: 0 });
    found.forEach((line, index) => {
      const to = found[index + 1]?.from ?? run.end;
      lines.push({
        ...line,
        to,
        spaces: spacesIn(node.textBetween(line.from, to)),
        last: index === found.length - 1,
      });
    });
  }
  return lines;
}
