// The keys of a document and the plugins that make it editable: the undo history, element ids,
// table editing and the keymap, as one extension a document kit installs.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import {
  baseKeymap,
  chainCommands,
  createParagraphNear,
  deleteSelection,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
  setBlockType,
  toggleMark,
} from 'prosemirror-commands';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { type Command, NodeSelection, type Plugin, type Transaction } from 'prosemirror-state';
import { resolveFootnoteSettings, type TemplateFile } from '../model/index.js';
import {
  changeParagraphLevel,
  clearFormatting,
  deleteEmptyListItem,
  insertPageBreak,
  joinAcrossPages,
  selectBody,
  splitBlockKeepingLevel,
  wrapInListAndJoin,
} from './editing-commands.js';
import { createElementIds } from './element-ids.js';
import { createFootnotes, insertFootnote } from './footnotes.js';
import { insertCodeBlock } from './object-commands.js';
import { createTableEditing } from './tables.js';

/** What a document's editing depends on. */
export interface DocumentEditingOptions {
  /** The resolved template, read when a key needs it, such as for paragraph levels. */
  template?: (() => TemplateFile) | undefined;
  /** The writer the elements a local change adds are attributed to. */
  author?: (() => string | null) | undefined;
  /** Whether a transaction came from elsewhere, such as a collaborator or the server. */
  isRemote?: ((tr: Transaction) => boolean) | undefined;
  /** Whether to keep the undo history; a collaborative editor keeps its own. Defaults to true. */
  history?: boolean | undefined;
}

const NO_TEMPLATE = (): TemplateFile => ({ formatVersion: 1, id: 'none' });

// A command that always reports it handled the key, so Tab never leaves the document.
const always =
  (command: Command): Command =>
  (state, dispatch, view) => {
    command(state, dispatch, view);
    return true;
  };

function markKeys(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = {};
  const bind = (key: string, name: string) => {
    const type = schema.marks[name];
    if (type) keys[key] = toggleMark(type);
  };
  bind('Mod-b', 'strong');
  bind('Mod-i', 'em');
  bind('Mod-u', 'underline');
  bind('Mod-Shift-s', 'strike');
  bind('Mod-.', 'superscript');
  bind('Mod-,', 'subscript');
  bind('Mod-Alt-i', 'code');
  return keys;
}

function blockKeys(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = {};
  const { heading, paragraph, bullet_list: bullets, ordered_list: ordered } = schema.nodes;
  if (heading) {
    for (let level = 1; level <= 6; level += 1)
      keys[`Mod-Shift-${String(level)}`] = setBlockType(heading, { level });
  }
  if (paragraph) keys['Mod-Shift-0'] = setBlockType(paragraph);
  if (bullets) keys['Mod-Shift-8'] = wrapInListAndJoin(bullets);
  if (ordered) keys['Mod-Shift-7'] = wrapInListAndJoin(ordered);
  return keys;
}

// Whether a block beside a text block is an object Backspace or Delete selects before deleting: an
// atom, such as an equation or a figure, or a table.
const isObjectBlock = (node: ProseMirrorNode) =>
  !node.isTextblock &&
  !node.isInline &&
  NodeSelection.isSelectable(node) &&
  (node.isAtom || node.type.spec.tableRole === 'table');

// At the edge of a text block beside an object, Backspace or Delete selects the object first; a
// second press deletes it.
const selectAtom =
  (side: -1 | 1): Command =>
  (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty || !$from.parent.isTextblock) return false;
    const offset = side < 0 ? 0 : $from.parent.content.size;
    if ($from.parentOffset !== offset || $from.depth === 0) return false;
    const pos = side < 0 ? $from.before() : $from.after();
    const $edge = state.doc.resolve(pos);
    const neighbour = side < 0 ? $edge.nodeBefore : $edge.nodeAfter;
    if (!neighbour || !isObjectBlock(neighbour)) return false;
    const at = side < 0 ? pos - neighbour.nodeSize : pos;
    dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
    return true;
  };

// Inside a footnote entry, which is one paragraph of text: Enter and Shift+Enter add nothing, and
// Backspace at its start and Delete at its end join nothing.
const inFootnoteEntry: Command = (state) =>
  state.selection.$from.parent.type.name === 'footnote_entry';

const atFootnoteEdge =
  (side: -1 | 1): Command =>
  (state) => {
    const { $from, empty } = state.selection;
    if (!empty || $from.parent.type.name !== 'footnote_entry') return false;
    return side < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size;
  };

/** A document's own keys, ahead of ProseMirror's base keymap. */
export function documentKeys(
  schema: Schema,
  template: () => TemplateFile = NO_TEMPLATE,
): Record<string, Command> {
  const item = schema.nodes.list_item;
  const listKey = (command: (type: NonNullable<typeof item>) => Command): Command =>
    item ? command(item) : () => false;
  return {
    ...markKeys(schema),
    ...blockKeys(schema),
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,
    'Mod-a': selectBody,
    'Mod-\\': clearFormatting,
    'Mod-Alt-Enter': insertPageBreak,
    'Mod-Space': clearFormatting,
    'Mod-Alt-c': insertCodeBlock(),
    'Mod-Alt-f': insertFootnote(),
    'Shift-Enter': inFootnoteEntry,
    Enter: chainCommands(
      inFootnoteEntry,
      newlineInCode,
      listKey(splitListItem),
      createParagraphNear,
      deleteSelection,
      liftEmptyBlock,
      splitBlockKeepingLevel,
    ),
    Backspace: chainCommands(
      deleteSelection,
      atFootnoteEdge(-1),
      deleteEmptyListItem,
      selectAtom(-1),
      joinAcrossPages(-1),
      joinBackward,
    ),
    Delete: chainCommands(
      deleteSelection,
      atFootnoteEdge(1),
      selectAtom(1),
      joinAcrossPages(1),
      joinForward,
    ),
    Tab: always(chainCommands(listKey(sinkListItem), changeParagraphLevel(1, template))),
    'Shift-Tab': always(chainCommands(listKey(liftListItem), changeParagraphLevel(-1, template))),
  };
}

// Whether footnotes are numbered in document order after each change: unless the template numbers
// them on each page, which the pagination does.
const numbersInOrder = (template: (() => TemplateFile) | undefined) => () =>
  !template || resolveFootnoteSettings(template(), null).numbering !== 'page';

/** The plugins that make a document editable, in the order they run. */
export function createDocumentEditing(
  schema: Schema,
  options: DocumentEditingOptions = {},
): Plugin[] {
  const { template, author, isRemote, history: keepHistory = true } = options;
  return [
    ...(keepHistory ? [history()] : []),
    createElementIds({ author, isRemote }),
    createFootnotes({ numberInOrder: numbersInOrder(template) }),
    ...createTableEditing(),
    gapCursor(),
    keymap(documentKeys(schema, template)),
    keymap(baseKeymap),
  ];
}

/**
 * The editing plugins as a kit extension: the history first, the element ids among the
 * interaction plugins, then table editing and the keymaps last, so other extensions' keys come
 * before them.
 */
export function createDocumentEditingExtension<C = unknown>(
  options: DocumentEditingOptions = {},
): RichTextExtension<C> {
  const { template, author, isRemote, history: keepHistory = true } = options;
  return {
    name: 'document-editing',
    plugins: [
      {
        name: 'history',
        priority: 100,
        when: () => keepHistory,
        build: () => [history()],
      },
      {
        name: 'element-ids',
        priority: 480,
        build: () => [createElementIds({ author, isRemote })],
      },
      {
        name: 'footnotes',
        priority: 490,
        build: () => [createFootnotes({ numberInOrder: numbersInOrder(template) })],
      },
      {
        name: 'tables',
        priority: 850,
        build: () => createTableEditing(),
      },
      {
        name: 'gap-cursor',
        priority: 860,
        build: () => [gapCursor()],
      },
      {
        name: 'keymap',
        priority: 900,
        build: (_context, schema) => [keymap(documentKeys(schema, template)), keymap(baseKeymap)],
      },
    ],
  };
}
