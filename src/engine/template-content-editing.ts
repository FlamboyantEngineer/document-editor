// Editing a template's section content and placeholders in place, on the pages of its preview shown
// in parts (`templatePreviewDocument` with `parts`): each template section's starting content and
// its placeholder are sections the writer edits, and the host hears each part's new content to
// write into its template. The rest of the preview is a read-only sample of the template's styles;
// its headers and footers stay the template's, edited as region editing edits them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  documentSections,
  regionAt,
  type TemplatePartChange,
  templatePartSections,
  writeStoredContent,
} from '../model/index.js';
import { isRemoteTransaction } from './transaction-kind.js';

/** What editing the template's content needs: whether it is on, and who hears each edit. */
export interface TemplateContentEditingOptions {
  readonly enabled: () => boolean;
  readonly onChange: (change: TemplatePartChange) => void;
}

/** The template content editing plugin's key. */
export const templateContentEditingKey = new PluginKey<DecorationSet>('templateContentEditing');

/** Whether a template's section content and placeholders are edited in place. */
export function editsTemplateContent(state: EditorState): boolean {
  const plugin = templateContentEditingKey.get(state);
  return Boolean(plugin && (plugin.spec as { enabled: () => boolean }).enabled());
}

/**
 * The lock of a preview shown in parts, for an edit lock (`isLocked` of `createDocumentEditing`):
 * the writer may change a template section's content and placeholder and the pages' headers and
 * footers, and nothing of the sample around them.
 */
export function templatePreviewLock(doc: ProseMirrorNode, pos: number): boolean {
  const region = regionAt(doc.resolve(pos));
  if (!region) return true;
  if (region.kind === 'header' || region.kind === 'footer') return false;
  return region.kind !== 'content' || region.section.name === null;
}

// The names of a document's sections in order, which a writer's change keeps.
const sectionNames = (doc: ProseMirrorNode) =>
  documentSections(doc)
    .map((section) => section.name ?? '')
    .join('\u0000');

// Whether a change is the writer's: not the pagination's, the regions set from the template, nor
// one from elsewhere.
const isWriters = (tr: Transaction) =>
  tr.docChanged &&
  tr.getMeta('addToHistory') !== false &&
  !tr.getMeta('appendedTransaction') &&
  !isRemoteTransaction(tr);

// Each part's section marked with the part it holds, and the sample's sections as the sample.
function decorate(doc: ProseMirrorNode): DecorationSet {
  const parts = new Map(templatePartSections(doc).map(({ section, part }) => [section.pos, part]));
  const decorations = documentSections(doc).map(({ node, pos }) =>
    Decoration.node(pos, pos + node.nodeSize, { 'data-template-part': parts.get(pos) ?? 'sample' }),
  );
  return DecorationSet.create(doc, decorations);
}

// The parts whose content a change made differ, each with its new content.
function changedParts(before: ProseMirrorNode, after: ProseMirrorNode): TemplatePartChange[] {
  const old = templatePartSections(before);
  const now = templatePartSections(after);
  if (old.length !== now.length) return [];
  return now.flatMap(({ section, part, content }, index) => {
    const was = old[index];
    const same = was?.section.name === section.name && was.part === part;
    if (!same || was.content.node.content.eq(content.node.content)) return [];
    return [{ section: section.name, part, content: writeStoredContent(content.node.content) }];
  });
}

/**
 * Lets a template's section content and placeholders be edited in place on a preview shown in
 * parts while `enabled` holds: each section is marked with the part it holds
 * (`data-template-part`: `content`, `placeholder` or `sample`), a writer's change that would add,
 * remove or rename a section is refused, and `onChange` hears each part's new content.
 */
export function createTemplateContentEditing(options: TemplateContentEditingOptions): Plugin {
  return new Plugin<DecorationSet>({
    key: templateContentEditingKey,
    enabled: options.enabled,
    state: {
      init: (_config, state) => (options.enabled() ? decorate(state.doc) : DecorationSet.empty),
      // A writer keeps the sections, so their marks move with the change.
      apply: (tr, value) => {
        if (!options.enabled()) return DecorationSet.empty;
        if (value === DecorationSet.empty) return decorate(tr.doc);
        return tr.docChanged ? value.map(tr.mapping, tr.doc) : value;
      },
    },
    filterTransaction: (tr) =>
      !options.enabled() || !isWriters(tr) || sectionNames(tr.before) === sectionNames(tr.doc),
    props: {
      decorations(state) {
        return templateContentEditingKey.getState(state) ?? null;
      },
    },
    view: () => ({
      update(view, previous) {
        if (!options.enabled() || view.state.doc === previous.doc) return;
        for (const change of changedParts(previous.doc, view.state.doc)) options.onChange(change);
      },
    }),
  });
}
