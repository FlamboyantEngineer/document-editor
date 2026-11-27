// The keys of a document and the plugins that make it editable: the undo history, element ids,
// table editing and the keymap, as one extension a document kit installs.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import {
  baseKeymap,
  chainCommands,
  deleteSelection,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
} from 'prosemirror-commands';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { type Command, NodeSelection, type Plugin, type Transaction } from 'prosemirror-state';
import type { TelemetryAdapter } from '../host/index.js';
import { findTemplateSection, type TemplateFile, templatePageMetrics } from '../model/index.js';
import { addParagraphNear, deleteEmptyParagraph } from './block-keys.js';
import { BODY_EDGE_KEYS } from './body-edge.js';
import { splitChecklistItem } from './checklists.js';
import { createClipboard, type PasteFilter } from './clipboard.js';
import { createCommentAnchors } from './comment-anchors.js';
import { createCommentDraft } from './comment-draft.js';
import { createCustomStyles } from './custom-styles.js';
import { createEditLock, type EditLockOptions } from './edit-lock.js';
import {
  changeParagraphLevel,
  deleteEmptyListItem,
  splitBlockKeepingLevel,
} from './editing-commands.js';
import { createElementIds } from './element-ids.js';
import { footnotePlugins } from './footnote-plugins.js';
import { createHistoryReveal } from './history-reveal.js';
import { createListJoins } from './list-joins.js';
import type { InvalidMathText } from './math-views.js';
import { type EditingMathOptions, objectPlugins } from './object-plugins.js';
import { createParagraphNumbering } from './paragraph-numbering.js';
import { boundKeys } from './shortcut-commands.js';
import {
  createShortcuts,
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  type ShortcutOverrides,
  type ShortcutTable,
} from './shortcuts.js';
import { noteSplitSource } from './split-authorship.js';
import { keepIdentityWithContent } from './split-identity.js';
import { createSuggestionRefusal } from './suggestion-refusal.js';
import { createTableWidth } from './table-width.js';
import { createTableEditing } from './tables.js';
import { anyLock, lockedTemplateSections } from './template-sync.js';
import { includeAppended } from './transaction-kind.js';
import { createTypingRules, type TypingRulesOptions } from './typing-rules.js';
import { createVariableTokens } from './variable-tokens.js';
import {
  type ContentLimit,
  createContentLimit,
  createSectionFill,
  createTrailingParagraph,
} from './writing-helpers.js';

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
  /** Filters the clipboard runs on every pasted and dropped slice, after the library's own. */
  pasteFilters?: readonly PasteFilter[] | undefined;
  /** The host's own lock, kept beside the lock on sections the template does not let be edited. */
  isLocked?: EditLockOptions['isLocked'] | undefined;
  /** The host's remapping of the shortcut table (`DEFAULT_SHORTCUTS`). */
  shortcuts?: ShortcutOverrides | undefined;
  /**
   * The typing shortcuts: Markdown-style blocks and marks and typography, each group on unless
   * turned off; false turns them all off. Defaults to all on.
   */
  typingRules?: boolean | TypingRulesOptions | undefined;
  /**
   * Keeps an empty paragraph at the end of each section's content that would otherwise end with a
   * table, a figure or another block that is no paragraph. Defaults to false.
   */
  trailingParagraph?: boolean | undefined;
  /** What math that does not typeset shows, inline and as a block (`DEFAULT_INVALID_MATH_TEXT`). */
  invalidMath?: InvalidMathText | undefined;
  /** The blocks a paragraph citing a footnote may sit in (`FootnotesOptions.citingPlaces`). */
  citingPlaces?: readonly string[] | undefined;
  /**
   * How math is typeset: the renderer, and how long it is waited for before the math shows as
   * invalid with the host's reason (`MathViewsOptions`).
   */
  math?: EditingMathOptions | undefined;
  /** Refuses local changes that take the body past this many words or characters. */
  limit?: ContentLimit | undefined;
  /**
   * Measures how long building each group of plugins took, under `document-editor.extension-build`
   * with the group's name as `extension`, for a host tracing how the editor opens.
   */
  telemetry?: Pick<TelemetryAdapter, 'measure'> | undefined;
}

// The name each plugin group's build is measured under (`EDITOR_MEASURES.extensionBuild`).
const EXTENSION_BUILD_MEASURE = 'document-editor.extension-build';

const NO_TEMPLATE = (): TemplateFile => ({ formatVersion: 1, id: 'none' });

// The lock the editing installs: the template's locked sections and the host's own lock.
function editLockOf({ template, isLocked }: DocumentEditingOptions): Plugin[] {
  const locks = [
    ...(template ? [lockedTemplateSections(template)] : []),
    ...(isLocked ? [isLocked] : []),
  ];
  return locks.length ? [createEditLock({ isLocked: anyLock(...locks) })] : [];
}

// A command that always reports it handled the key, so Tab never leaves the document.
const always =
  (command: Command): Command =>
  (state, dispatch, view) => {
    command(state, dispatch, view);
    return true;
  };

// The objects Backspace or Delete selects before deleting, beside the atoms: a figure and a table
// with their captions, and a template block, which holds what its markup rendered.
const CAPTIONED_OBJECTS = new Set(['figure', 'table_figure', 'dynamic_template']);

// Whether a block beside a text block is an object Backspace or Delete selects before deleting: an
// atom, such as an equation, a figure, or a table with its caption.
const isObjectBlock = (node: ProseMirrorNode) =>
  !node.isTextblock &&
  !node.isInline &&
  NodeSelection.isSelectable(node) &&
  (node.isAtom || CAPTIONED_OBJECTS.has(node.type.name));

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

// The text blocks that are one line of text each: a footnote entry and a caption.
const ONE_LINE = new Set(['footnote_entry', 'figure_caption', 'table_caption', 'code_caption']);

// Inside a footnote entry or a caption, which is one paragraph of text: Enter and Shift+Enter add
// nothing, and Backspace at its start and Delete at its end join nothing.
const inOneLine: Command = (state) => ONE_LINE.has(state.selection.$from.parent.type.name);

const atOneLineEdge =
  (side: -1 | 1): Command =>
  (state) => {
    const { $from, empty } = state.selection;
    if (!empty || !ONE_LINE.has($from.parent.type.name)) return false;
    return side < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size;
  };

// Enter over a selected inline node removes it; a selected range of text is left to the split,
// which replaces it (DOCE-EDITING-2.3).
const deleteSelectedNode: Command = (state, dispatch) =>
  state.selection instanceof NodeSelection &&
  state.selection.node.isInline &&
  deleteSelection(state, dispatch);

/**
 * A document's own keys, ahead of ProseMirror's base keymap: the shortcut table's document actions
 * (`DEFAULT_SHORTCUTS`, or a host's remapping of it) and the editing keys.
 */
export function documentKeys(
  schema: Schema,
  template: () => TemplateFile = NO_TEMPLATE,
  table: ShortcutTable = DEFAULT_SHORTCUTS,
): Record<string, Command> {
  const item = schema.nodes.list_item;
  const listKey = (command: (type: NonNullable<typeof item>) => Command): Command =>
    item ? command(item) : () => false;
  return {
    ...boundKeys(schema, table),
    'Shift-Enter': inOneLine,
    Enter: keepIdentityWithContent(
      chainCommands(
        inOneLine,
        newlineInCode,
        noteSplitSource(listKey(splitChecklistItem)),
        addParagraphNear,
        deleteSelectedNode,
        liftEmptyBlock,
        noteSplitSource(splitBlockKeepingLevel),
      ),
    ),
    Backspace: chainCommands(
      deleteSelection,
      atOneLineEdge(-1),
      deleteEmptyListItem,
      selectAtom(-1),
      joinBackward,
      deleteEmptyParagraph(-1),
    ),
    Delete: chainCommands(
      deleteSelection,
      atOneLineEdge(1),
      deleteEmptyParagraph(1),
      selectAtom(1),
      joinForward,
    ),
    Tab: always(chainCommands(listKey(sinkListItem), changeParagraphLevel(1, template))),
    'Shift-Tab': always(chainCommands(listKey(liftListItem), changeParagraphLevel(-1, template))),
  };
}

// The width of a section's pages' content, which its tables keep within.
const tableWidth = (template: () => TemplateFile) => ({
  maxWidth: (sectionName: string | null) => {
    const resolved = template();
    const { width, margins } = templatePageMetrics(
      resolved,
      findTemplateSection(resolved, sectionName),
    );
    return width - margins.left - margins.right;
  },
});

// Numbered paragraphs, when given the template, after the custom styles.
const paragraphNumberingPlugin = (template: (() => TemplateFile) | undefined) => ({
  name: 'paragraph-numbering',
  priority: 516,
  when: () => Boolean(template),
  build: () => (template ? [createParagraphNumbering({ template })] : []),
});

// The typing shortcuts, before the variable tokens and the keymaps, so Backspace takes one back
// before it deletes.
const typingRulesPlugin = (rules: DocumentEditingOptions['typingRules']) => ({
  name: 'typing-rules',
  priority: 835,
  when: () => rules !== false,
  build: (_context: unknown, schema: Schema) =>
    createTypingRules(schema, typeof rules === 'object' ? rules : {}),
});

// Typed `{{key}}` tokens becoming variables, before the table and key handling.
const VARIABLE_TOKENS_PLUGIN = {
  name: 'variable-tokens',
  priority: 840,
  build: () => [createVariableTokens()],
};

/**
 * The editing plugins as a kit extension: the history first, the lock and the element ids among
 * the interaction plugins, then table editing and the keymaps last, so other extensions' keys come
 * before them.
 */
export function createDocumentEditingExtension<C = unknown>(
  options: DocumentEditingOptions = {},
): RichTextExtension<C> {
  const { template, author, history: keepHistory = true } = options;
  const isRemote = options.isRemote && includeAppended(options.isRemote);
  return {
    name: 'document-editing',
    plugins: [
      { name: 'history', priority: 100, when: () => keepHistory, build: () => [history()] },
      // Each undo's change comes into view, shared or not (DOCE-EDITING-2.11).
      { name: 'history-reveal', priority: 101, build: () => [createHistoryReveal()] },
      {
        name: 'edit-lock',
        priority: 470,
        when: () => Boolean(template ?? options.isLocked),
        build: () => editLockOf(options),
      },
      {
        name: 'element-ids',
        priority: 480,
        build: () => [createElementIds({ author, isRemote })],
      },
      ...footnotePlugins(options, isRemote),
      { name: 'comment-draft', priority: 495, build: () => [createCommentDraft()] },
      { name: 'comment-anchors', priority: 496, build: () => [createCommentAnchors()] },
      { name: 'suggestion-refusal', priority: 497, build: () => [createSuggestionRefusal()] },
      ...objectPlugins(options),
      {
        name: 'clipboard',
        priority: 510,
        build: () => [createClipboard({ filters: options.pasteFilters, template })],
      },
      {
        name: 'custom-styles',
        priority: 515,
        when: () => Boolean(template),
        build: () => (template ? [createCustomStyles({ template })] : []),
      },
      paragraphNumberingPlugin(template),
      typingRulesPlugin(options.typingRules),
      VARIABLE_TOKENS_PLUGIN,
      {
        name: 'table-width',
        priority: 845,
        when: () => Boolean(template),
        build: () => (template ? [createTableWidth({ ...tableWidth(template), isRemote })] : []),
      },
      { name: 'tables', priority: 850, build: () => createTableEditing({ isRemote }) },
      { name: 'gap-cursor', priority: 860, build: () => [gapCursor()] },
      { name: 'list-joins', priority: 865, build: () => [createListJoins({ isRemote })] },
      {
        name: 'trailing-paragraph',
        priority: 870,
        when: () => options.trailingParagraph ?? false,
        build: () => [createTrailingParagraph({ isRemote })],
      },
      { name: 'section-fill', priority: 871, build: () => [createSectionFill({ isRemote })] },
      {
        name: 'content-limit',
        priority: 465,
        when: () => Boolean(options.limit),
        build: () => (options.limit ? [createContentLimit(options.limit, { isRemote })] : []),
      },
      {
        name: 'keymap',
        priority: 900,
        build: (_context, schema) => {
          const table = resolveShortcuts(options.shortcuts);
          return [
            createShortcuts(table, documentKeys(schema, template, table)),
            keymap({ ...baseKeymap, ...BODY_EDGE_KEYS }),
          ];
        },
      },
    ],
  };
}

/** The plugins that make a document editable, in the order they run. */
export function createDocumentEditing(
  schema: Schema,
  options: DocumentEditingOptions = {},
): Plugin[] {
  const { plugins = [] } = createDocumentEditingExtension<undefined>(options);
  const measure = options.telemetry?.measure.bind(options.telemetry);
  return plugins
    .filter((entry) => entry.when?.(undefined) ?? true)
    .toSorted((a, b) => a.priority - b.priority)
    .flatMap((entry) => {
      if (!measure) return entry.build(undefined, schema);
      const started = globalThis.performance.now();
      const built = entry.build(undefined, schema);
      measure(EXTENSION_BUILD_MEASURE, globalThis.performance.now() - started, {
        extension: entry.name,
      });
      return built;
    });
}
