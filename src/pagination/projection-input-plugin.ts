// The paged projection's own input plugin: keys and paste run on the canonical state, and a press
// on the pages may start a cell selection across the parts of a split table.

import type { Slice } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { canonicalKeys, canonicalPaste, type CanonicalPluginsSource } from './canonical-plugins.js';
import { pressBelowContent } from './page-caret.js';
import { canonicalCellAt, projectionKeys } from './projection-input.js';
import { moveAcrossBreak, runCommand, send, type Session, take } from './projection-session.js';

// The projection's own plugin: keys and paste run on the canonical state, and a press may start a
// cell selection across the parts of a split table.
export function inputPlugin(session: () => Session, source: CanonicalPluginsSource): Plugin {
  let keys: ReturnType<typeof projectionKeys> | null = null;
  const delegated = canonicalKeys(source);
  const pasted = canonicalPaste(source);
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        keys ??= projectionKeys({
          keys: session().options.keys,
          run: (command) => runCommand(session(), command),
          across: (move) => moveAcrossBreak(session(), move),
          delegate: (pressed) => delegated(view, pressed),
        });
        const handled = keys(view, event);
        const arrow = !event.shiftKey && event.key.startsWith('Arrow');
        if (!handled && arrow) session().cells.release();
        return handled;
      },
      handlePaste: (view, event, slice: Slice) =>
        pasted(view, event, slice) ||
        runCommand(session(), (state, dispatch) => {
          dispatch?.(state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        }),
      handleDOMEvents: {
        mousedown(view, event) {
          const current = session();
          if (pressBelowContent(view, event, source)) return true;
          current.cells.release();
          current.cells.drag(view, event, {
            cellAt: (moved) => canonicalCellAt(view, current, moved),
            canonical: () => current.canonical,
            select(tr) {
              send(current, tr);
              take(current, current.projection.tr);
            },
          });
          return false;
        },
      },
    },
  });
}
