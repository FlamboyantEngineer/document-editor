// What the pages' text layout engine keeps by node (DOCE-PAGINATION-11.1): each top-level block's
// layout and each text block's lines, until what they depend on changes. A result laid out with a
// provisional atom, such as math before its typeset answer, is never kept (DOCE-PAGINATION-12.13).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { noRoom } from '../layout-engine/blocks/context.js';
import { insertedKey } from '../layout-engine/inserted-text.js';
import type { createTextLayout } from '../layout-engine/text-layout.js';
import type { LayoutBlock } from '../model/index.js';
import type { ContentsLists } from './contents-lists.js';
import { refusedAsDrawn, reportUnplacedWords } from './host-rules.js';
import { blockInsertedKey, type InsertedTexts } from './inserted-texts.js';
import { markerKey, type NodeNumbers } from './node-numbers.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';

interface KeptBlock {
  readonly key: string;
  readonly block: LayoutBlock;
}

interface KeptLines {
  readonly key: string;
  readonly table: DrawnLines | null;
}

/** What a kept result's key reads, and how many provisional atoms were sized so far. */
interface KeptInputs {
  readonly widthOf: (scope: string | null) => number;
  readonly numbers: () => NodeNumbers;
  readonly markupKey: (node: ProseMirrorNode) => string;
  readonly variablesKey: (node: ProseMirrorNode) => string;
  /** How many provisional atoms were sized: a result laid out with one is not kept. */
  readonly provisional: () => number;
}

// What `lay` lays out, kept unless a provisional atom was sized while laying it out.
function keptUnlessProvisional<Kept>(
  kept: WeakMap<ProseMirrorNode, Kept>,
  node: ProseMirrorNode,
  { provisional, lay }: { provisional: () => number; lay: () => Kept },
): Kept {
  const before = provisional();
  const laid = lay();
  if (provisional() === before) kept.set(node, laid);
  else kept.delete(node);
  return laid;
}

/** Each text block's lines as the pages draw them, kept by node until what they depend on changes. */
export function keptLines(text: ReturnType<typeof createTextLayout>, inputs: KeptInputs) {
  const { widthOf, numbers, markupKey, variablesKey, provisional } = inputs;
  // The lines read with other plugins' inserted words, as the editor draws them, apart from those
  // read without, as the pages' layout for a print or viewer reads them: neither replaces the other.
  let withWords = new WeakMap<ProseMirrorNode, KeptLines>();
  let plain = new WeakMap<ProseMirrorNode, KeptLines>();
  return {
    forget() {
      withWords = new WeakMap();
      plain = new WeakMap();
    },
    lines(node: ProseMirrorNode, place: Parameters<PagesTextEngine['lines']>[1]) {
      const markers = markerKey(node, numbers().footnoteOf);
      const words = insertedKey(place.inserted);
      const key = `${place.scope ?? ''}|${place.prefix ?? ''}|${place.number?.label ?? ''}|${markers}|${words}|${markupKey(node)}${variablesKey(node)}`;
      const kept = words ? withWords : plain;
      const found = kept.get(node);
      if (found?.key === key) return found.table;
      const width = widthOf(place.scope);
      const { scope, prefix, number, inserted } = place;
      return keptUnlessProvisional(kept, node, {
        provisional,
        lay: () => {
          const result = text.layoutText(node, { width, scope, prefix, number, inserted });
          const justify = text.typography(node, place.scope).align === 'justify';
          return { key, table: result.ok ? { ...result.table, justify } : null };
        },
      }).table;
    },
  };
}

/** What laying a top-level block out reads beside the kept inputs. */
interface BlockInputs extends KeptInputs {
  readonly geometry: ReturnType<typeof createBlockLayout>;
  readonly contents: ContentsLists;
  readonly hostViews: () => ReadonlySet<string>;
  readonly refuse: (node: ProseMirrorNode, reason: string) => void;
  readonly laid: () => void;
  /** Sets the words inserted in the blocks being measured, for the text layout to read. */
  readonly withInserted: <T>(inserted: InsertedTexts, lay: () => T) => T;
}

/** Each top-level block's layout, kept by node until what it depends on changes. */
export function keptBlocks(inputs: BlockInputs) {
  const { geometry, contents, numbers, variablesKey, widthOf, refuse } = inputs;
  let kept = new WeakMap<ProseMirrorNode, KeptBlock>();
  return {
    forget() {
      kept = new WeakMap();
    },
    measure(node: ProseMirrorNode, scope: string | null, inserted: InsertedTexts): LayoutBlock {
      // Read first: rules that size otherwise forget every kept block.
      const hostViews = inputs.hostViews();
      const listed = contents.keyOf(node, numbers().doc) + variablesKey(node);
      // Words inserted outside its text blocks take no room, but are reported when it is laid out.
      const outside = inserted.outside.has(node) ? '!' : '';
      const key = `${scope ?? ''}|${numbers().keyOf(node)}|${blockInsertedKey(node, inserted)}${outside}|${inputs.markupKey(node)}${listed}`;
      const found = kept.get(node);
      if (found?.key === key) return found.block;
      // A block that cannot be laid out is kept as one too, and counted once (DOCE-PAGINATION-14.6).
      const refused = (at: ProseMirrorNode, reason: string) => {
        refuse(at, reason);
        return { key, block: noRoom(node) };
      };
      return keptUnlessProvisional(kept, node, {
        provisional: inputs.provisional,
        lay: () => {
          const refusal = refusedAsDrawn(node, hostViews);
          if (refusal) return refused(node, refusal);
          reportUnplacedWords(node, inserted, refuse);
          const result = inputs.withInserted(inserted, () =>
            geometry.layoutBlock(node, { width: widthOf(scope), scope }),
          );
          if (!result.ok) return refused(result.node, result.reason);
          inputs.laid();
          return { key, block: result.block };
        },
      }).block;
    },
  };
}
