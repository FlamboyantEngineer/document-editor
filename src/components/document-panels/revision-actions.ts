import type { Key } from '@flamboyantengineer/ui-components/core';
import { useLayoutEffect, useRef, useState } from 'react';
import type { RevisionItem } from './revision-item.js';

type RevisionAction = 'rename' | 'restore';

interface RevisionTarget {
  key: Key;
  action: RevisionAction;
}

interface RevisionActionsOptions {
  versions: readonly RevisionItem[];
  currentKey?: Key | null | undefined;
  onRestore?: ((key: Key) => unknown) | undefined;
  onRename?: ((key: Key, label: string) => unknown) | undefined;
}

interface RevisionActions {
  dialog: { version: RevisionItem; action: RevisionAction } | null;
  openDialog: (key: Key, action: RevisionAction) => void;
  closeDialog: () => void;
  restore: (key: Key) => unknown;
  rename: (key: Key, name: string) => unknown;
}

/** Resolves policy against the full latest collection, independent of its visible filters. */
function resolveTarget(options: RevisionActionsOptions, target: RevisionTarget) {
  const version = options.versions
    .flatMap((item) => [item, ...(item.children ?? [])])
    .find((item) => item.id === target.key);
  const allowed =
    target.action === 'restore'
      ? options.onRestore && target.key !== options.currentKey
      : options.onRename;
  return version && allowed ? { version, action: target.action } : null;
}

/** A dialog's target stays live; its submit checks current availability once more. */
export function useRevisionActions(options: RevisionActionsOptions): RevisionActions {
  const [target, setTarget] = useState<RevisionTarget | null>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const dialog = target ? resolveTarget(options, target) : null;
  if (target && !dialog) setTarget(null);
  return {
    dialog,
    openDialog: (key: Key, action: RevisionAction) => setTarget({ key, action }),
    closeDialog: () => setTarget(null),
    restore: (key: Key) => {
      const current = latest.current;
      if (!resolveTarget(current, { key, action: 'restore' })) return undefined;
      return current.onRestore?.(key);
    },
    rename: (key: Key, name: string) => {
      const current = latest.current;
      const found = resolveTarget(current, { key, action: 'rename' });
      if (!found || name === (found.version.label ?? '')) return undefined;
      return current.onRename?.(key, name);
    },
  };
}
