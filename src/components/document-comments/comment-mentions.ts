// Mentions in comments: `@` in a composer lists the people the host's identity finds, or the people,
// groups and assistants its mentions adapter finds, and a mention shows as a chip in the text. A composer taking mentions is focused once drawn.

import type { CommentMentions } from '@flamboyantengineer/ui-components/comment-composer';
import { createCommentMentions } from '@flamboyantengineer/ui-components/comment-composer/rich';
import { useEffect, useMemo, useRef } from 'react';
import type { IdentityAdapter, MentionsAdapter } from '../../host/index.js';
import { getComposedActiveElement } from '../../utils/composed-focus.js';

/**
 * The comments' mentions: the people, groups and assistants the host's `mentions` finds, written
 * in its token format, or else the people `identity` finds.
 */
export function useCommentMentions(
  identity: IdentityAdapter,
  mentions?: MentionsAdapter | undefined,
): CommentMentions {
  return useMemo(() => {
    if (!mentions) {
      return createCommentMentions({
        search: async (query, signal) =>
          (await identity.findPeople(query, signal)).map((person) => ({
            id: person.id,
            name: person.name,
            avatar: person.avatarUrl,
          })),
      });
    }
    const { serialize, parse } = mentions;
    return createCommentMentions({
      search: async (query, signal) =>
        (await mentions.find(query, signal)).map((target) => ({
          kind: target.kind,
          id: target.id,
          name: target.name,
          avatar: target.avatarUrl,
          description: target.description,
          count: target.count,
        })),
      serialize: serialize
        ? (candidate) =>
            serialize.call(mentions, {
              kind: candidate.kind ?? 'person',
              id: candidate.id,
              name: candidate.name,
            })
        : undefined,
      parse: parse ? (text) => parse.call(mentions, text) : undefined,
    });
  }, [identity, mentions]);
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
