// The styles of a template scope as the engine reads them, merged once per template and scope.

import type { TemplateFile, TemplateStyles } from '../model/format/template-format.js';
import { templateScopeStyles } from '../model/templates/template-properties.js';
import { findTemplateSection } from '../model/templates/template-sections.js';

// A scope's styles merged over the template's, kept by template and scope: a template is never
// changed in place, and merging clones its settings, which every block would otherwise pay.
const mergedStyles = new WeakMap<TemplateFile, Map<string, TemplateStyles>>();

/** A template scope's styles, the section's over the template's, merged once. */
export function scopeStyles(template: TemplateFile, scope: string | null | undefined) {
  let byScope = mergedStyles.get(template);
  if (!byScope) {
    byScope = new Map();
    mergedStyles.set(template, byScope);
  }
  const key = scope ?? '';
  let styles = byScope.get(key);
  if (!styles) {
    styles = templateScopeStyles(template, scope ? findTemplateSection(template, scope) : null);
    byScope.set(key, styles);
  }
  return styles;
}
