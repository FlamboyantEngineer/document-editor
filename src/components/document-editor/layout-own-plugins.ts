// The plugins a document's layout adds to the editor's own: its page debugging, list starts, page
// variables and dynamic template content, the stored texts of the variables a writer adds, search, authorship, region
// and template content editing with its script previews, sections, template edit defaults, change
// lines, version changes, unbreakable citation identifiers, the refresh of abbreviations a writer
// adds and, unless the host installs its own, its lists of contents.

import type { Plugin } from 'prosemirror-state';
import type { RefObject } from 'react';
import { createTemplateEditDefaults } from '../../engine/figure-defaults.js';
import {
  createAbbreviationRefresh,
  createAuthorship,
  createChangeLines,
  createDocumentSections,
  createDocumentValues,
  createDynamicTemplates,
  createReferenceIdentifiers,
  createRegionEditing,
  createSearch,
  createTemplateContentEditing,
  createTemplateScriptPreviews,
  createVersionChanges,
} from '../../engine/index.js';
import { findTemplateSection, templatePageMetrics } from '../../model/index.js';
import { createListStarts, createPageDebug, createPageVariables } from '../../pagination/index.js';
import { editorContents } from './editor-contents.js';
import type { DocumentLayoutOptions } from './use-document-layout.js';

/** The plugins the layout adds to the editor's own, reading the options as they are now. */
export function layoutOwnPlugins(latest: RefObject<DocumentLayoutOptions>): Plugin[] {
  return [
    createPageDebug({
      shown: () => latest.current.debug ?? {},
      sheet: (section) => {
        const { template } = latest.current;
        const name = section.attrs.sectionName as string | null;
        return templatePageMetrics(template, findTemplateSection(template, name));
      },
    }),
    createListStarts(),
    createPageVariables(),
    createDynamicTemplates(),
    createDocumentValues(() => ({
      value: (key) => latest.current.variables?.value(key),
      template: latest.current.template,
    })),
    editorContents(latest),
    createSearch(),
    createSearch('pane'),
    createAuthorship(),
    createRegionEditing({
      enabled: () => Boolean(latest.current.onRegionChange),
      template: () => latest.current.template,
      onChange: (change) => latest.current.onRegionChange?.(change),
    }),
    createTemplateContentEditing({
      enabled: () => Boolean(latest.current.onTemplatePartChange),
      onChange: (change) => latest.current.onTemplatePartChange?.(change),
    }),
    createTemplateScriptPreviews({
      enabled: () => Boolean(latest.current.onTemplatePartChange),
      runner: () => latest.current.scriptRunner,
    }),
    createDocumentSections({ template: () => latest.current.template }),
    ...createTemplateEditDefaults(() => latest.current.template),
    createChangeLines(),
    createVersionChanges({
      previous: () => latest.current.compare?.previous ?? null,
      display: () => latest.current.compare?.display ?? 'markup',
      suggestions: () => latest.current.compare?.suggestions ?? 'rejected',
      generated: () => latest.current.compare?.generated ?? false,
      scope: () => latest.current.compare?.scope ?? null,
    }),
    createReferenceIdentifiers(),
    createAbbreviationRefresh({
      glossary: () => latest.current.glossary,
      enabled: () => latest.current.editable !== false && latest.current.suggesting !== true,
    }),
  ];
}
