// What the pages' text layout engine keeps by node (DOCE-PAGINATION-11.1): each top-level block's
// layout and each text block's lines, until what they depend on changes. A result laid out with a
// provisional atom, such as math before its typeset answer, is never kept (DOCE-PAGINATION-12.13).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { noRoom } from '../layout-engine/blocks/context.js';
import { suggestionKey } from '../layout-engine/hidden-suggestions.js';
import { insertedKey } from '../layout-engine/inserted-text.js';
import type { createTextLayout } from '../layout-engine/text-layout.js';
import type { LayoutBlock } from '../model/index.js';
import type { ContentsLists } from './contents-lists.js';
import { refusedAsDrawn, reportUnplacedWords } from './host-rules.js';
import { blockInsertedKey, type InsertedTexts, NO_INSERTED } from './inserted-texts.js';
import { markerKey, type NodeNumbers } from './node-numbers.js';
import type { DrawnLines, PagesTextEngine, TextEngineOptions } from './text-engine-types.js';

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
  readonly markup: TextEngineOptions['markup'];
  readonly variablesKey: (node: ProseMirrorNode) => string;
  /** How many provisional atoms were sized: a result laid out with one is not kept. */
  readonly provisional: () => number;
}

// Keeps what `lay` lays out unless a provisional atom was sized while laying it out, or it gives
// nothing to keep.
function keptUnlessProvisional<Kept, Result>(
  kept: WeakMap<ProseMirrorNode, Kept>,
  node: ProseMirrorNode,
  {
    provisional,
    lay,
  }: { provisional: () => number; lay: () => { kept: Kept | null; result: Result } },
): Result {
  const before = provisional();
  const laid = lay();
  if (laid.kept && provisional() === before) kept.set(node, laid.kept);
  else kept.delete(node);
  return laid.result;
}

/** Each text block's lines as the pages draw them, kept by node until what they depend on changes. */
export function keptLines(text: ReturnType<typeof createTextLayout>, inputs: KeptInputs) {
  const { widthOf, numbers, markup, variablesKey, provisional } = inputs;
  let kept = new WeakMap<ProseMirrorNode, KeptLines>();
  return {
    forget() {
      kept = new WeakMap();
    },
    lines(node: ProseMirrorNode, place: Parameters<PagesTextEngine['lines']>[1]) {
      const markers = markerKey(node, numbers().footnoteOf);
      const words = insertedKey(place.inserted);
      const key = `${place.scope ?? ''}|${place.prefix ?? ''}|${place.number?.label ?? ''}|${markers}|${words}|${suggestionKey(node, markup)}${variablesKey(node)}`;
      const found = kept.get(node);
      if (found?.key === key) return found.table;
      const width = widthOf(place.scope);
      const { scope, prefix, number, inserted } = place;
      return keptUnlessProvisional(kept, node, {
        provisional,
        lay: () => {
          const result = text.layoutText(node, { width, scope, prefix, number, inserted });
          const justify = text.typography(node, place.scope).align === 'justify';
          const table = result.ok ? { ...result.table, justify } : null;
          return { kept: { key, table }, result: table };
        },
      });
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
  readonly inserting: (inserted: InsertedTexts) => void;
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
      const refusal = refusedAsDrawn(node, inputs.hostViews());
      if (refusal) {
        refuse(node, refusal);
        return noRoom(node);
      }
      reportUnplacedWords(node, inserted, refuse);
      const listed = contents.keyOf(node, numbers().doc) + variablesKey(node);
      const key = `${scope ?? ''}|${numbers().keyOf(node)}|${blockInsertedKey(node, inserted)}|${suggestionKey(node, inputs.markup)}${listed}`;
      const found = kept.get(node);
      if (found?.key === key) return found.block;
      return keptUnlessProvisional(kept, node, {
        provisional: inputs.provisional,
        lay: () => {
          inputs.inserting(inserted);
          const result = geometry.layoutBlock(node, { width: widthOf(scope), scope });
          inputs.inserting(NO_INSERTED);
          if (!result.ok) {
            refuse(result.node, result.reason);
            return { kept: null, result: noRoom(node) };
          }
          inputs.laid();
          return { kept: { key, block: result.block }, result: result.block };
        },
      });
    },
  };
}
