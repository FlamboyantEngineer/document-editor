// Keeping a document's content in layout sections, for documents whose every block sits in one: a
// run of blocks outside a section is wrapped in a one-column section, and content with no section
// gets an empty one to type in. A server applies this as it seeds a document, and the editor keeps
// it after each local edit. Wrapping only adds a section and a column around a run, so the blocks
// keep their identity and a caret inside them stays put.

import { Fragment, type Node as ProseMirrorNode, NodeRange } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import { LAYOUT_SECTION_NODE } from '../schema/block-layout-nodes.js';

/** The preset of a section the wrapping creates. */
export const WRAPPING_LAYOUT_PRESET = 'single';

interface Container {
  readonly node: ProseMirrorNode;
  /** The position of the container's first child. */
  readonly start: number;
}

interface Run {
  readonly from: number;
  to: number;
}

// The containers whose blocks belong in sections: each editable section's page content, or the
// document itself when it has no sections.
function containersOf(doc: ProseMirrorNode): Container[] {
  const containers: Container[] = [];
  let sections = false;
  doc.forEach((section, offset) => {
    if (section.type.name !== 'page_section') return;
    sections = true;
    if (section.attrs.editable === false) return;
    section.forEach((page, pageOffset) => {
      page.forEach((region, regionOffset) => {
        if (region.type.name !== 'page_content') return;
        containers.push({ node: region, start: offset + pageOffset + regionOffset + 3 });
      });
    });
  });
  return sections ? containers : [{ node: doc, start: 0 }];
}

function looseRuns(containers: readonly Container[]): Run[] {
  const runs: Run[] = [];
  for (const { node, start } of containers) {
    let run: Run | null = null;
    node.forEach((child, offset) => {
      const from = start + offset;
      if (child.type.name === LAYOUT_SECTION_NODE) run = null;
      else if (run) run.to = from + child.nodeSize;
      else runs.push((run = { from, to: from + child.nodeSize }));
    });
  }
  return runs;
}

function holdsSection(containers: readonly Container[]): boolean {
  return containers.some(({ node }) => {
    let found = false;
    node.forEach((child) => {
      found ||= child.type.name === LAYOUT_SECTION_NODE;
    });
    return found;
  });
}

/** Whether a block of the editable content sits outside a layout section, or none holds it. */
export function needsLayoutSections(doc: ProseMirrorNode): boolean {
  const containers = containersOf(doc);
  return containers.length > 0 && (looseRuns(containers).length > 0 || !holdsSection(containers));
}

/**
 * Wraps each run of blocks outside a layout section in a one-column section and, when no section
 * remains, adds an empty one. Returns whether the document changed.
 */
export function wrapInLayoutSections(tr: Transform): boolean {
  const { layout_section: section, layout_column: column } = tr.doc.type.schema.nodes;
  if (!section || !column) return false;
  const steps = tr.steps.length;
  // Last to first, so the positions still to visit hold.
  for (const run of looseRuns(containersOf(tr.doc)).reverse()) {
    if (!column.validContent(tr.doc.slice(run.from, run.to).content)) continue;
    const $from = tr.doc.resolve(run.from);
    tr.wrap(new NodeRange($from, tr.doc.resolve(run.to), $from.depth), [
      { type: section, attrs: { preset: WRAPPING_LAYOUT_PRESET } },
      { type: column },
    ]);
  }
  const containers = containersOf(tr.doc);
  const first = containers[0];
  if (first && !holdsSection(containers)) {
    const empty = section.createAndFill({ preset: WRAPPING_LAYOUT_PRESET });
    if (empty) tr.insert(first.start + first.node.content.size, empty);
  }
  return tr.steps.length > steps;
}

/** A fragment with every layout section replaced by its columns' content, at any depth. */
export function unwrapLayoutSections(fragment: Fragment): Fragment {
  const blocks: ProseMirrorNode[] = [];
  let changed = false;
  fragment.forEach((child) => {
    if (child.type.name === LAYOUT_SECTION_NODE) {
      changed = true;
      child.forEach((column) => column.forEach((block) => blocks.push(block)));
      return;
    }
    const content = unwrapLayoutSections(child.content);
    changed ||= content !== child.content;
    blocks.push(content === child.content ? child : child.copy(content));
  });
  return changed ? Fragment.fromArray(blocks) : fragment;
}
