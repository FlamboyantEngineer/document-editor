// Editing a template's page headers and footers in place, on the pages: while it is on, every
// page's header and footer can be edited, an edit in one shows in the same region of every page of
// its section, and the host hears the region's new content to write into its template. Until the
// template it gives back holds that content, the edit stands over the template's.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { resolveSectionRegion } from '../model/format/template-format-resolve.js';
import {
  documentRegions,
  readTemplateContent,
  type RegionKind,
  type StoredContent,
  type TemplateFile,
  writeStoredContent,
} from '../model/index.js';
import { findTemplateSection } from '../model/templates/template-sections.js';
import { documentSectionsKey } from './document-sections.js';

/** A page region: the header or the footer. */
export type PageRegion = 'header' | 'footer';

/** A region edited on the pages: its section, by name, null for the document's, and its content. */
export interface RegionChange {
  readonly section: string | null;
  readonly region: PageRegion;
  readonly content: StoredContent;
}

const PAGE_REGIONS: ReadonlySet<RegionKind> = new Set<PageRegion>(['header', 'footer']);

/** The edits standing over the template's regions, by section and region. */
export type RegionEdits = ReadonlyMap<string, Fragment>;

/** The key of a section's region among the edits. */
export const regionKey = (section: string | null, region: PageRegion) =>
  `${section ?? ''}\u0000${region}`;

interface RegionEditingState {
  readonly edits: RegionEdits;
  /** The keys the last change edited, which the other pages and the host still need. */
  readonly changed: readonly string[];
}

/** The region editing plugin's key. */
export const regionEditingKey = new PluginKey<RegionEditingState>('regionEditing');

const NO_EDITS: RegionEdits = new Map();

/** The edits standing over the template's regions; none while regions are not edited. */
export function regionEdits(state: EditorState): RegionEdits {
  return regionEditingKey.getState(state)?.edits ?? NO_EDITS;
}

/** Whether the pages' headers and footers are edited in place. */
export function editsRegions(state: EditorState): boolean {
  const plugin = regionEditingKey.get(state);
  return Boolean(plugin && (plugin.spec as { enabled: () => boolean }).enabled());
}

/** A region node at a position, with the section it is in. */
interface RegionAt {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly key: string;
}

// Every page's header and footer, with its section's key.
function regionsOf(doc: ProseMirrorNode): RegionAt[] {
  return documentRegions(doc, PAGE_REGIONS).map(({ pos, node, kind, section }) => ({
    pos,
    node,
    key: regionKey(section.name, kind === 'header' ? 'header' : 'footer'),
  }));
}

// The range a step changed, in the document after it: what it replaced, or the text it marked or
// the node whose attributes it set, which change no positions.
function stepRange(tr: Transaction, index: number): readonly [number, number][] {
  const step = tr.steps[index] as { from?: unknown; to?: unknown; pos?: unknown } | undefined;
  const ranges: [number, number][] = [];
  tr.mapping.maps[index]?.forEach((...range: number[]) =>
    ranges.push([range[2] ?? 0, range[3] ?? 0]),
  );
  if (ranges.length) return ranges;
  if (typeof step?.from === 'number' && typeof step.to === 'number') return [[step.from, step.to]];
  return typeof step?.pos === 'number' ? [[step.pos, step.pos + 1]] : [];
}

// The regions a writer's change edited, by key, with their content now.
function editedRegions(tr: Transaction): Map<string, Fragment> {
  const edited = new Map<string, Fragment>();
  const regions = regionsOf(tr.doc);
  tr.steps.forEach((_step, index) => {
    const later = tr.mapping.slice(index + 1);
    for (const [from, to] of stepRange(tr, index)) {
      const start = later.map(from, -1);
      const end = later.map(to, 1);
      for (const region of regions) {
        const inside = start > region.pos && end < region.pos + region.node.nodeSize;
        if (inside) edited.set(region.key, region.node.content);
      }
    }
  });
  return edited;
}

// Whether a change is the writer's: not the regions set from the template, nor the pagination.
const isWriters = (tr: Transaction) =>
  tr.docChanged &&
  tr.getMeta('addToHistory') !== false &&
  !tr.getMeta('appendedTransaction') &&
  !tr.getMeta(regionEditingKey);

// The template's content of a region, read as the pages show it.
function templateContent(template: TemplateFile, key: string, doc: ProseMirrorNode): Fragment {
  const [name, region] = key.split('\u0000') as [string, PageRegion];
  const section = findTemplateSection(template, name || null);
  const stored = resolveSectionRegion(template, section, region)?.content ?? [];
  return Fragment.from(readTemplateContent(stored, doc.type.schema));
}

/** What region editing needs: whether it is on, the template, and who hears each edit. */
export interface RegionEditingOptions {
  readonly enabled: () => boolean;
  readonly template: () => TemplateFile;
  readonly onChange: (change: RegionChange) => void;
}

function applyEdits(
  tr: Transaction,
  value: RegionEditingState,
  template: TemplateFile,
): RegionEditingState {
  if (isWriters(tr)) {
    const edited = editedRegions(tr);
    if (!edited.size) return value;
    return { edits: new Map([...value.edits, ...edited]), changed: [...edited.keys()] };
  }
  // Once the template given back holds an edit, the template stands again.
  if (!tr.getMeta(documentSectionsKey)) return value;
  const edits = new Map(
    [...value.edits].filter(([key, edit]) => !templateContent(template, key, tr.doc).eq(edit)),
  );
  return edits.size === value.edits.size ? value : { edits, changed: [] };
}

/**
 * Lets the pages' headers and footers be edited in place while `enabled` holds: an edit shows in
 * the same region of every page of its section, and `onChange` hears the region's new content.
 */
export function createRegionEditing(options: RegionEditingOptions): Plugin<RegionEditingState> {
  return new Plugin<RegionEditingState>({
    key: regionEditingKey,
    enabled: options.enabled,
    state: {
      init: () => ({ edits: NO_EDITS, changed: [] }),
      apply: (tr, value) => applyEdits(tr, value, options.template()),
    },
    // The other pages' copies of an edited region take its content.
    appendTransaction(transactions, _before, after) {
      const changed = regionEditingKey.getState(after)?.changed ?? [];
      if (!changed.length || !transactions.some(isWriters)) return null;
      const edits = regionEdits(after);
      const tr = after.tr;
      for (const region of regionsOf(after.doc).reverse()) {
        const edit = changed.includes(region.key) ? edits.get(region.key) : undefined;
        if (!edit || region.node.content.eq(edit)) continue;
        tr.replaceWith(region.pos + 1, region.pos + region.node.nodeSize - 1, edit);
      }
      return tr.docChanged
        ? tr.setMeta(regionEditingKey, true).setMeta('addToHistory', false)
        : null;
    },
    view: () => ({
      update(view, previous) {
        const now = regionEditingKey.getState(view.state);
        if (!now || now === regionEditingKey.getState(previous) || !now.changed.length) return;
        for (const key of now.changed) {
          const edit = now.edits.get(key);
          if (!edit) continue;
          const [name, region] = key.split('\u0000') as [string, PageRegion];
          options.onChange({ section: name || null, region, content: writeStoredContent(edit) });
        }
      },
    }),
  });
}
