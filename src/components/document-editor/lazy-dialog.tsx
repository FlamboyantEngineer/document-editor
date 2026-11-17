// The dialogs that load on first use (DOCE-ENTRY-2.2), loaded again the next time one opens when its
// code failed to load, as a dropped connection may make it: React keeps a lazy component's failure
// for good, so a failed one is made anew. A dialog that fails to load closes, and the editor tells
// the writer (`DialogLoadFailed`).

import { type ComponentType, createContext, lazy, use, useEffect } from 'react';

/** Tells the writer a dialog could not load; the editor around the dialogs provides it. */
export const DialogLoadFailed = createContext<() => void>(() => undefined);

// What a dialog that failed to load renders: nothing, closing itself once, telling the writer and
// making the dialog load again when it next opens.
function Failed({ onClose, reset }: { readonly onClose: () => void; readonly reset: () => void }) {
  const failed = use(DialogLoadFailed);
  useEffect(() => {
    reset();
    failed();
    onClose();
  }, [failed, onClose, reset]);
  return null;
}

/** A dialog that loads the first time it opens, and again the next time after a failed load. */
export function lazyDialog<P extends { readonly onClose: () => void }>(
  load: () => Promise<ComponentType<P>>,
) {
  const make = () =>
    lazy(async (): Promise<{ default: ComponentType<P> }> => {
      try {
        return { default: await load() };
      } catch {
        const reset = () => {
          Loaded = make();
        };
        return { default: ({ onClose }: P) => <Failed onClose={onClose} reset={reset} /> };
      }
    });
  let Loaded = make();
  return function LazyDialog(props: P) {
    return <Loaded {...props} />;
  };
}
