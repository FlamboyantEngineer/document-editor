// The layout debugging's modes, which the `debug` shortcut cycles through while the host follows
// them (`onDebugChange`): off, the block borders, and the pages' markup beside them.

import { type RefObject, useEffect } from 'react';
import { matchesShortcut, shortcutsOf } from '../../engine/index.js';
import type { DocumentEditorDebug, DocumentEditorProps } from './document-editor.js';
import { debugParts } from './root-data.js';

// The parts each mode shows, in the order the shortcut steps through them.
const MODES: readonly DocumentEditorDebug[] = [{}, { pages: true, blocks: true }, { source: true }];

// Which mode the parts shown stand for: the furthest one they reach.
function modeOf(debug: DocumentEditorDebug): number {
  if (debug.source) return 2;
  return debug.pages || debug.blocks ? 1 : 0;
}

/**
 * The `debug` shortcut (Mod-Alt-B) anywhere in the editor, its chrome included, hands the host the
 * parts of the mode after the one shown, back to none after the markup; nothing without
 * `onDebugChange`.
 */
export function useDebugShortcut(
  root: RefObject<HTMLElement | null>,
  props: Pick<DocumentEditorProps, 'debug' | 'onDebugChange' | 'state'>,
) {
  const { onDebugChange } = props;
  const mode = modeOf(debugParts(props.debug));
  const shortcuts = shortcutsOf(props.state);
  useEffect(() => {
    const element = root.current;
    if (!element || !onDebugChange) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(shortcuts, 'debug', event)) return;
      event.preventDefault();
      onDebugChange(MODES[(mode + 1) % MODES.length] ?? {});
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [root, mode, onDebugChange, shortcuts]);
}
