// Whose settings the template editor shows, tracked by the section's name, so adding, moving or
// deleting another section never moves it. A host may hold it (`scope` with `onScopeChange`), as a
// workspace does to keep it over a reload, or leave it to the editor (`defaultScope`).

import { useState } from 'react';
import type { TemplateSection } from '../../model/index.js';

/** The document's settings (null), or the template section's of that name. */
export type TemplateScope = string | null;

/** The scope as the template editor's props give it. */
export interface TemplateScopeProps {
  /** The scope the host holds; with it, the editor shows that scope and asks to change it. */
  readonly scope?: TemplateScope | undefined;
  /** The scope the editor starts with while the host holds none. */
  readonly defaultScope?: TemplateScope | undefined;
  /** Receives each scope the editor moves to: picked, added, renamed or deleted. */
  readonly onScopeChange?: ((scope: TemplateScope) => void) | undefined;
}

/** The scope a name gives among sections: the section's, or the document's when none has it. */
export function scopeIn(
  sections: readonly TemplateSection[] | null | undefined,
  scope: TemplateScope | undefined,
): TemplateScope {
  if (scope === null || scope === undefined) return null;
  return sections?.some((section) => section.name === scope) ? scope : null;
}

/**
 * The scope shown among sections, and a function that moves it: held by the host when it gives
 * `scope`, and by the editor otherwise. A name no section has shows the document's settings.
 */
export function useTemplateScope(
  props: TemplateScopeProps,
  sections: readonly TemplateSection[] | null | undefined,
): readonly [TemplateScope, (scope: TemplateScope) => void] {
  const [own, setOwn] = useState<TemplateScope>(props.defaultScope ?? null);
  const held = props.scope !== undefined;
  const scope = scopeIn(sections, held ? props.scope : own);
  const move = (next: TemplateScope) => {
    if (!held) setOwn(next);
    props.onScopeChange?.(next);
  };
  return [scope, move];
}
