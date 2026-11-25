// The nodes host rules size, drawn in the box the engine laid them out at (DOCE-PAGINATION-14.2):
// each gets a node decoration with its box as hooks, so the host's view or the node's own drawing
// fits that box, clipped, and never moves the pages. A viewer or a print reads the same boxes from
// the pages' layout.

import { PluginKey } from 'prosemirror-state';
import { objectBoxHooks } from '../engine/object-box.js';
import {
  placementsPlugin,
  type PlacementsSource,
  type PlacementsState,
} from './engine-placements.js';

const engineObjectsKey = new PluginKey<PlacementsState>('engine-objects');

/** Draws each node a host rule sized at the box the engine laid it out at. */
export const engineObjects = (source: PlacementsSource) =>
  placementsPlugin(source, {
    key: engineObjectsKey,
    holds: (node, engine) => engine?.sizedType?.(node) ?? false,
    decorate(node, engine) {
      const box = engine.objectOf?.(node);
      return box ? { attrs: objectBoxHooks(box), spec: { objectBox: box } } : null;
    },
    placed: (engine) => engine?.objectsVersion?.() ?? 0,
  });
