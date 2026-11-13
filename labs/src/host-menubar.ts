// The full editor lab's File menu, as a host adds it to the editor's menubar: saving, which the
// lab reports. Its exports come from the host's exports adapter (`host-exports.ts`).

import type { DocumentMenubarOptions } from '../../src/components/index.js';

/** The lab's menubar options: its File menu, saving through `onSave`. */
export function hostMenubar(onSave: () => void): DocumentMenubarOptions {
  return {
    items: [
      {
        menu: 'file',
        entries: () => [{ id: 'save', label: 'Save', shortcut: 'Ctrl+S', onAction: onSave }],
      },
    ],
  };
}
