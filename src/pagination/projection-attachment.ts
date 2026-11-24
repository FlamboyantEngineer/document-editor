import type { EditorView } from 'prosemirror-view';
import { bindPageMaps } from './page-map.js';
import type { Session } from './projection-session.js';

/** Connects the projection's layout and editing listeners to the view that shows it. */
export function bindProjectionView(session: Session) {
  let detach: (() => void) | null = null;
  return {
    attach(view: EditorView) {
      detach?.();
      session.view = view;
      const unbind = bindPageMaps(view, session.pageMaps.read);
      const unwatch = session.edits.watch(view);
      const release = () => {
        if (detach !== release) return;
        unwatch();
        unbind();
        detach = null;
        session.view = null;
      };
      detach = release;
      return release;
    },
    detach: () => detach?.(),
  };
}
