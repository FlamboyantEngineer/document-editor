// The styling hooks a component emits, by the hook contract: a `de-<component>` root class, a
// `de-<component>__<slot>` class per slot and data attributes, as the base library builds its own.

import {
  dataAttributes,
  type DataValues,
  type HookProps,
  mergeClassNames,
  pickDataAttributes,
  type RootHookOptions,
} from '@flamboyantengineer/ui-components/core';

/** One component's hooks. */
export interface DocumentHooks<Slot extends string> {
  /** The root class, such as `de-document-editor`. */
  readonly className: string;
  /** Props for the root element: root class, caller class, caller data attributes, hook values. */
  root(options?: RootHookOptions): HookProps;
  /** Props for a slot element: `de-<component>__<slot>` plus hook values. */
  slot(slot: Slot, data?: DataValues): HookProps;
}

/** Creates the hooks of one component; its slots are declared up front. */
export function createHooks<const Slot extends string = never>(
  name: string,
  _slots: readonly Slot[] = [],
): DocumentHooks<Slot> {
  const className = `de-${name}`;
  return {
    className,
    root: ({ className: extra, data, props } = {}) => ({
      ...(props ? pickDataAttributes(props) : {}),
      ...dataAttributes(data),
      className: mergeClassNames(className, extra),
    }),
    slot: (slot, data) => ({ ...dataAttributes(data), className: `${className}__${slot}` }),
  };
}
