// Where the labs remember the reader's stylesheet and theme choice.

import { createSafeStorage, type UiStorage } from '@flamboyantengineer/ui-components/core';

/**
 * The page's localStorage, whose refused reads and writes are ignored (remembering a choice is a
 * convenience; private windows may refuse it), or null when the browser refuses access.
 */
export function labStorage(): UiStorage | null {
  try {
    return createSafeStorage(window.localStorage);
  } catch {
    return null;
  }
}
