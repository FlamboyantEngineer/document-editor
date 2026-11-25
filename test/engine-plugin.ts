// A real text layout engine on the base template, given to a state as the pages' view gives its
// engine (`forcedLinesKey`), for tests of commands that read what the engine laid out.

import { Plugin } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { BASE_TEMPLATE } from '../src/model/templates/base-template.js';
import { forcedLinesKey, type ForcedLinesState } from '../src/pagination/forced-lines.js';
import { createPagesTextEngine } from '../src/pagination/text-engine.js';
import type { PagesTextEngine } from '../src/pagination/text-engine-types.js';
import { installFakeCanvas } from './canvas-fixtures.js';

/** A text layout engine on the base template, measuring with the fake canvas. */
export function baseEngine(): PagesTextEngine {
  installFakeCanvas();
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
  });
}

/** A plugin that holds an engine where the forced lines keep theirs, drawing nothing. */
export function engineHeld(engine: PagesTextEngine): Plugin<ForcedLinesState> {
  const state: ForcedLinesState = {
    engine,
    version: 0,
    decorations: DecorationSet.empty,
    drawn: null,
    caret: -1,
    inserted: '',
  };
  return new Plugin<ForcedLinesState>({
    key: forcedLinesKey,
    state: { init: () => state, apply: () => state },
  });
}
