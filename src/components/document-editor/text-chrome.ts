// The editor's opt-in chrome in the text itself: a toolbar over selected text, and the menus the
// writer opens by typing.

import type { MentionOptions } from './mention-menu.js';
import type { SelectionToolbarOptions } from './selection-toolbar.js';
import type { SlashMenuOptions } from './slash-menu.js';

/** The editor's props for the chrome it shows in the text, each off by default. */
export interface TextChromeProps {
  /**
   * Shows a toolbar floating over selected text, with the character formats, the link and a
   * comment, and the host's items when given as options. Alt+F10 moves focus into it. Defaults to
   * false.
   */
  selectionToolbar?: boolean | SelectionToolbarOptions | undefined;
  /**
   * Opens a menu of what the writer can insert when they type `/` at the start of a block or after
   * a space, narrowed as they type on, with the host's options and a button on empty lines when
   * given as options. Defaults to false.
   */
  slashMenu?: boolean | SlashMenuOptions | undefined;
  /**
   * Opens a menu of the people whose names match what the writer types after `@`, as the host's
   * mentions adapter finds them, and inserts the person chosen as a mention.
   */
  mentions?: MentionOptions | undefined;
}
