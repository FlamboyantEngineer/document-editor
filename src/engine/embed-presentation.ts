// How a table an embed holds is presented in the document: its column widths, row heights, cell
// alignment, header cells, layout and caption, the caption's text included, are the writer's, while
// its cells' content is the host's. The writer may change that presentation inside an embed, and an update keeps it where
// the table the host loads still has the row, column or table it was set on.

import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import {
  AddMarkStep,
  AttrStep,
  RemoveMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from 'prosemirror-transform';
import { isEmbed } from '../model/index.js';

// The attributes of a table, and of its cells, that present it rather than say what it holds.
const TABLE_PRESENTATION = ['objectLayout', 'captionEnabled', 'tableBorderClass'];
const CELL_PRESENTATION = ['colwidth', 'rowHeight', 'textAlign', 'verticalAlign'];

const CELL_ROLES = new Set(['cell', 'header_cell']);
const roleOf = (node: ProseMirrorNode): unknown => node.type.spec.tableRole;
const isCell = (node: ProseMirrorNode) => CELL_ROLES.has(String(roleOf(node)));

function presentationOf(node: ProseMirrorNode): readonly string[] {
  if (isCell(node)) return CELL_PRESENTATION;
  return roleOf(node) === 'table' ? TABLE_PRESENTATION : [];
}

// Whether a node set in place of another only presents it differently: a table, row or cell with
// the same attributes but its presentation, a cell becoming a header cell or the other way.
function onlyPresents(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  const sameKind = before.type === after.type || (isCell(before) && isCell(after));
  if (!sameKind || !roleOf(before)) return false;
  const free = new Set(presentationOf(before));
  const keys = new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)]);
  return [...keys].every((key) => free.has(key) || before.attrs[key] === after.attrs[key]);
}

// Whether a step edits the text of one table's caption, which is the writer's.
function inCaption(step: Step, doc: ProseMirrorNode): boolean {
  const ranged =
    step instanceof ReplaceStep || step instanceof AddMarkStep || step instanceof RemoveMarkStep;
  if (!ranged) return false;
  const $from = doc.resolve(step.from);
  return $from.sameParent(doc.resolve(step.to)) && $from.parent.type.name === 'table_caption';
}

/**
 * Whether a step only changes how a table is presented, by setting its, a row's or a cell's
 * presentation attributes or turning cells into header cells and back, keeping what they hold.
 */
export function isPresentationStep(step: Step, doc: ProseMirrorNode): boolean {
  if (inCaption(step, doc)) return true;
  if (step instanceof AttrStep) {
    const node = doc.nodeAt(step.pos);
    return Boolean(node && presentationOf(node).includes(step.attr));
  }
  if (!(step instanceof ReplaceAroundStep)) return false;
  const { slice } = step;
  const around = step.gapFrom - step.from === 1 && step.to - step.gapTo === 1;
  const retyped = slice.size === 2 && slice.openStart === 0 && slice.openEnd === 0;
  const before = doc.nodeAt(step.from);
  const after = slice.content.firstChild;
  return around && retyped && before !== null && after !== null && onlyPresents(before, after);
}

/** Whether a position is inside a table an embed holds, whose rows and columns are the host's. */
export function inEmbeddedTable($from: ResolvedPos): boolean {
  let table = false;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    table ||= roleOf(node) === 'table';
    if (isEmbed(node)) return table;
  }
  return false;
}

const pick = (node: ProseMirrorNode, keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, node.attrs[key] as unknown]));

interface Cell {
  readonly top: number;
  readonly left: number;
}

// The cell of a table starting at a row and column, or null.
function cellStarting(table: ProseMirrorNode, map: TableMap, { top, left }: Cell) {
  if (top >= map.height || left >= map.width) return null;
  const at = map.map[top * map.width + left];
  if (at === undefined) return null;
  const rect = map.findCell(at);
  return rect.left === left && rect.top === top ? table.nodeAt(at) : null;
}

// A table the host loaded, presented as the one it replaces: the table's own presentation, and
// each cell's where the old table has a cell starting at the same row and column; a column width
// only where the cell spans as many columns as it did.
function keepTable(before: ProseMirrorNode, after: ProseMirrorNode): ProseMirrorNode {
  const old = TableMap.get(before);
  const map = TableMap.get(after);
  const rows: ProseMirrorNode[] = [];
  after.forEach((row, rowOffset) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell, cellOffset) => {
      const { left, top } = map.findCell(rowOffset + 1 + cellOffset);
      const was = cellStarting(before, old, { top, left });
      if (!was) {
        cells.push(cell);
        return;
      }
      const attrs = { ...cell.attrs, ...pick(was, CELL_PRESENTATION) };
      if (was.attrs.colspan !== cell.attrs.colspan) attrs.colwidth = cell.attrs.colwidth;
      cells.push(was.type.create(attrs, cell.content, cell.marks));
    });
    rows.push(row.copy(Fragment.from(cells)));
  });
  const attrs = { ...after.attrs, ...pick(before, TABLE_PRESENTATION) };
  return after.type.create(attrs, Fragment.from(rows), after.marks);
}

/**
 * The content a host loaded for an embed, with the presentation the writer gave the tables it
 * replaces kept: the first table it holds takes the first table's, and so on. The rows and
 * columns are the loaded table's.
 */
export function keepEmbeddedPresentation(before: Fragment, after: Fragment): Fragment {
  const old: ProseMirrorNode[] = [];
  before.forEach((node) => {
    if (tableIn(node)) old.push(node);
  });
  let index = 0;
  const kept: ProseMirrorNode[] = [];
  after.forEach((node) => {
    const was = tableIn(node) ? old[index++] : undefined;
    kept.push(was ? keepCaptioned(was, node) : node);
  });
  return Fragment.from(kept);
}

// The table a block is, or holds with its caption; null for any other block.
function tableIn(node: ProseMirrorNode): ProseMirrorNode | null {
  if (roleOf(node) === 'table') return node;
  return node.type.name === 'table_figure' ? node.lastChild : null;
}

// A table the host loaded, with its caption, presented as the one it replaces: its table as
// `keepTable` keeps it, and the caption the writer gave the table it replaces.
function keepCaptioned(before: ProseMirrorNode, after: ProseMirrorNode): ProseMirrorNode {
  const was = tableIn(before);
  const now = tableIn(after);
  if (!was || !now) return after;
  const table = keepTable(was, now);
  if (after === now) return table;
  const caption = before === was ? after.firstChild : before.firstChild;
  return caption ? after.copy(Fragment.from([caption, table])) : after;
}
