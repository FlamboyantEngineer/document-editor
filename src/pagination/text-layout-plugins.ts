// The plugins the pages take with the text layout engine (DOCE-PAGINATION-11): the numbers it laid
// them out with and the lines it computed.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import { engineMath } from './engine-math.js';
import { engineNumbers } from './engine-numbers.js';
import { forcedLines } from './forced-lines.js';
import { forcedRegions } from './forced-regions.js';
import type { TextEngineHolder } from './text-engine-holder.js';

/** The engine's plugins on the pages' view. */
export function textLayoutPlugins(
  text: TextEngineHolder,
  source: { readonly canonical: () => ProseMirrorNode; readonly redraw: () => void },
): Plugin[] {
  const engine = () => text.engine();
  return [
    engineNumbers({ engine, canonical: source.canonical }),
    forcedLines({ engine, version: () => text.version(), redraw: source.redraw }),
    forcedRegions(),
    // After the forced lines, whose lines lay their blocks out and so place their math.
    engineMath({ engine, version: () => text.version() }),
  ];
}
