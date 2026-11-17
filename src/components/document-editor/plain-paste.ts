// The unformatted paste the writer asks for with the `paste-plain` key (Mod-Shift-V): it arms the
// view for the one paste that key starts, which then reads only the clipboard's plain text. Any
// other key, a key release, a pointer press, focus leaving or a second passing first cancels it, so
// it never strips the formatting of a later paste.

import type { EditorProps, EditorView } from 'prosemirror-view';
import { matchesShortcut, pasteUnformattedText, shortcutsOf } from '../../engine/index.js';

// How long an armed paste waits for the browser's paste event.
const ARMED_FOR = 1000;

interface Armed {
  readonly view: EditorView;
  readonly at: number;
}

/** A view's arming of the unformatted paste, and the handlers that take and cancel it. */
interface PlainPaste {
  /** Arms on the `paste-plain` key; any other key cancels. Never handles the key itself. */
  readonly keydown: (view: EditorView, event: KeyboardEvent) => void;
  /** Takes an armed paste as its plain text; false leaves any other paste to the editor. */
  readonly paste: (view: EditorView, event: ClipboardEvent) => boolean;
  /** Cancels an armed paste. */
  readonly cancel: () => void;
}

/** The unformatted paste of one view (DOCE-EDITING-5.6). */
export function plainPaste(now: () => number = () => Date.now()): PlainPaste {
  let armed: Armed | null = null;
  return {
    keydown(view, event) {
      armed = matchesShortcut(shortcutsOf(view.state), 'paste-plain', event)
        ? { view, at: now() }
        : null;
    },
    paste(view, event) {
      const current = armed;
      armed = null;
      if (current?.view !== view || now() - current.at > ARMED_FOR) return false;
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text && view.editable) pasteUnformattedText(view, text);
      return true;
    },
    cancel() {
      armed = null;
    },
  };
}

/** What cancels an armed unformatted paste: a key release, a pointer press and focus leaving. */
export function plainPasteCancels(
  plain: PlainPaste,
  blur: NonNullable<EditorProps['handleDOMEvents']>['blur'],
): NonNullable<EditorProps['handleDOMEvents']> {
  const cancel = () => {
    plain.cancel();
    return false;
  };
  return {
    keyup: cancel,
    mousedown: cancel,
    blur: (view, event) => {
      plain.cancel();
      return blur?.(view, event) ?? false;
    },
  };
}
