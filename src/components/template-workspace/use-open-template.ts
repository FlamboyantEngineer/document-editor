// The template open in the workspace, kept where a request that comes back reads it as it is now,
// and the tags that say whether a request's answer still applies: one made before another template
// was opened, or before a later request of the same kind, is dropped (DOCE-TEMPLATE-EDITOR-3.9).

import { useState } from 'react';
import type { OpenTemplate } from './template-requests.js';

/** Requests of which only the latest one's answer applies. */
export type RequestKind = 'view';

/** How the workspace changes the open template and tags its requests. */
export interface OpenTemplateActions {
  /** The open template as it is now, for a request that comes back. */
  current: () => OpenTemplate | null;
  /** Changes the open template, keeping the requests made for it. */
  update: (update: (open: OpenTemplate | null) => OpenTemplate | null) => void;
  /** Opens another template, or none: the answers to requests made before it are dropped. */
  replace: (open: OpenTemplate | null) => void;
  /**
   * Tags a request with the template open now and, for a kind, with its count among that kind's
   * requests: the check returned says whether its answer still applies.
   */
  tag: (kind?: RequestKind) => () => boolean;
}

function createActions(setOpen: (open: OpenTemplate | null) => void): OpenTemplateActions {
  let latest: OpenTemplate | null = null;
  let opened = 0;
  const counts = new Map<RequestKind, number>();
  const show = (open: OpenTemplate | null) => {
    latest = open;
    setOpen(open);
  };
  return {
    current: () => latest,
    update: (update) => show(update(latest)),
    replace: (open) => {
      opened += 1;
      show(open);
    },
    tag: (kind) => {
      const at = opened;
      const count = kind ? (counts.get(kind) ?? 0) + 1 : 0;
      if (kind) counts.set(kind, count);
      return () => at === opened && (!kind || counts.get(kind) === count);
    },
  };
}

/** The open template, and the actions that change it and tag its requests, which stay the same. */
export function useOpenTemplate() {
  const [open, setOpen] = useState<OpenTemplate | null>(null);
  const [actions] = useState(() => createActions(setOpen));
  return [open, actions] as const;
}
