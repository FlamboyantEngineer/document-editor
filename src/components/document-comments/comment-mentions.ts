// Mentions in comments: `@` in a composer lists the people the host's identity finds, and a mention
// shows as the person's chip in the comment's text. A composer taking mentions is focused once drawn.

import type { CommentMentions } from '@flamboyantengineer/ui-components/comment-composer';
import { createCommentMentions } from '@flamboyantengineer/ui-components/comment-composer/rich';
import { useEffect, useMemo, useRef } from 'react';
import type { IdentityAdapter } from '../../host/index.js';
import { getComposedActiveElement } from '../../utils/composed-focus.js';

/** The comments' mentions, searching the people `identity` finds. */
export function useCommentMentions(identity: IdentityAdapter): CommentMentions {
  return useMemo(
    () =>
      createCommentMentions({
        search: async (query, signal) =>
          (await identity.findPeople(query, signal)).map((person) => ({
            id: person.id,
            name: person.name,
            avatar: person.avatarUrl,
          })),
      }),
    [identity],
  );
}

/**
 * Focuses a composer's text box once it is drawn. A composer taking mentions draws its rich text box
 * after it mounts, so its own autofocus finds nothing to focus yet.
 */
export function useFocusOnMount() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const window = ref.current?.ownerDocument.defaultView;
    if (!window) return undefined;
    let frame = 0;
    let tries = 0;
    const focus = () => {
      const box = ref.current?.querySelector<HTMLElement>('[contenteditable="true"], textarea');
      if (box) {
        if (!box.contains(getComposedActiveElement(box.ownerDocument))) box.focus();
      } else if ((tries += 1) < 30) frame = window.requestAnimationFrame(focus);
    };
    frame = window.requestAnimationFrame(focus);
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return ref;
}
