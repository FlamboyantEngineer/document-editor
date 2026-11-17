// The plugins a document's layout adds to the editor's own: its page debugging, list starts, page
// variables and dynamic template content, footnote numbers by section, search, authorship, region
// and template content editing, sections, template edit defaults, change lines, version changes,
// unbreakable citation identifiers, the refresh of abbreviations a writer adds and, unless the host installs its own, its lists of
// contents.

import type { Plugin } from 'prosemirror-state';
import type { RefObject } from 'react';
import { createTemplateEditDefaults } from '../../engine/figure-defaults.js';
import {
  createAbbreviationRefresh,
  createAuthorship,
  createChangeLines,
  createDocumentSections,
  createDynamicTemplates,
  createReferenceIdentifiers,
  createRegionEditing,
  createSearch,
  createSectionFootnoteNumbers,
  createTemplateContentEditing,
  createVersionChanges,
} from '../../engine/index.js';
import {
  findTemplateSection,
  resolveFootnoteSettings,
  templatePageMetrics,
} from '../../model/index.js';
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
    createPageVariables({ value: (key) => latest.current.variables?.value(key) }),
    createDynamicTemplates({ value: (key) => latest.current.variables?.value(key) }),
    createSectionFootnoteNumbers({
      enabled: () =>
        latest.current.layout === 'web' &&
        resolveFootnoteSettings(latest.current.template, null).numbering === 'page',
    }),
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
