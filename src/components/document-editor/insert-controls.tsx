// The toolbar items that insert objects at the selection: a footnote, code, math, a figure, a list
// of contents and a special character, and the link of the selected text. Items that need a
// dialog open the editor's; the rest run their command.

import type { CharacterGridCategory } from '@flamboyantengineer/ui-components/character-grid';
import {
  AbbreviationGlyph,
  CodeBlockGlyph,
  CrossReferenceGlyph,
  FootnoteGlyph,
  FormulaGlyph,
  ImageGlyph,
  LayoutAddBelowGlyph,
  LinkGlyph,
  TableOfContentsGlyph,
  TerminalGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Command } from 'prosemirror-state';
import {
  canInsertReference,
  insertCodeBlock,
  insertContents,
  insertDocumentSection,
  insertFootnote,
  insertMath,
  insertScriptBlock,
  linkAt,
  scriptBlockAt,
  setFigure,
  setLink,
  setLinkedCode,
  shortcutLabel,
  shortcutsOf,
  type ShortcutTable,
} from '../../engine/index.js';
import { DEFAULT_CONTENTS_KINDS, type TemplateFile } from '../../model/index.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { SymbolButton } from './symbol-button.js';
import type { ToolbarButtonItem, ToolbarItem } from './toolbar-items.js';

/** What the insert items offer beside the commands the schema allows. */
export interface InsertFeatures {
  /** Whether the host resolves linked code, which the code menu then offers. */
  readonly linkedCode: boolean;
  /** The symbol picker's characters. */
  readonly symbols: readonly CharacterGridCategory[];
  /** Whether the host has a glossary, which the abbreviation button then offers. */
  readonly glossary: boolean;
  /** The template's custom styles, which the text style field offers after the others. */
  readonly customStyles?: readonly string[] | undefined;
  /** The template, whose sections a writer may add the section menu offers. */
  readonly template?: TemplateFile | undefined;
  /** Whether the host finds references to other documents, which the reference menu offers. */
  readonly references?: boolean | undefined;
  /** Whether the host runs scripts, which the script button then inserts. */
  readonly scripts?: boolean | undefined;
  /** Whether the host draws diagrams, which the figure menu then offers beside images. */
  readonly diagrams?: boolean | undefined;
}

// Whether a command can run, while the writer can edit there.
const can = (context: EditorContext, command: Command) => context.canRun(command);

// A menu entry that runs a command, disabled while it cannot run.
const entry = (
  context: EditorContext,
  { id, label }: { id: string; label: string },
  command: Command,
) => ({
  id,
  label,
  isDisabled: !can(context, command),
  onAction: () => context.run(command),
});

/** The link item: opens the link dialog, pressed while the selection is in a link. */
export function linkItem(labels: DocumentEditorLabels): ToolbarButtonItem {
  return {
    kind: 'button',
    id: 'link',
    label: labels.link,
    icon: LinkGlyph,
    run: (context) => context.openDialog({ kind: 'link' }),
    isEnabled: (context) => can(context, setLink('https://')),
    isPressed: (context) => linkAt(context.state) !== null,
  };
}

function codeEntries(context: EditorContext, linkedCode: boolean): MenuEntry[] {
  const { labels } = context;
  const linked = setLinkedCode({ url: '', code: '' });
  return [
    {
      ...entry(context, { id: 'code-block', label: labels.codeBlock }, insertCodeBlock()),
      shortcut: shortcutLabel(shortcutsOf(context.state), 'code-block'),
    },
    ...(linkedCode
      ? [
          {
            id: 'linked-code',
            label: labels.linkedCode,
            isDisabled: !can(context, linked),
            onAction: () => context.openDialog({ kind: 'linked-code' }),
          },
        ]
      : []),
  ];
}

// The figure item: a button for an image, or a menu of an image and a diagram while the host draws
// diagrams.
function figureItem(labels: DocumentEditorLabels, features: InsertFeatures): ToolbarItem {
  const isEnabled = (context: EditorContext) => can(context, setFigure({ src: 'about:blank' }));
  const common = { id: 'figure', label: labels.figure, icon: ImageGlyph };
  if (!features.diagrams) {
    return {
      ...common,
      kind: 'button',
      run: (context) => context.openDialog({ kind: 'figure' }),
      isEnabled,
    };
  }
  return {
    ...common,
    kind: 'menu',
    isEnabled,
    entries: (context) =>
      (['image', 'diagram'] as const).map((figureType) => ({
        id: `${figureType}-figure`,
        label: figureType === 'image' ? labels.imageFigure : labels.diagramFigure,
        onAction: () => context.openDialog({ kind: 'figure', figureType }),
      })),
  };
}

function mathEntries(context: EditorContext): MenuEntry[] {
  const { labels } = context;
  return ([false, true] as const).map((display) => ({
    id: display ? 'display-math' : 'inline-math',
    label: display ? labels.displayMath : labels.inlineMath,
    isDisabled: !can(context, insertMath('x', { display })),
    onAction: () => context.openDialog({ kind: 'math', display }),
  }));
}

const contentsEntries = (context: EditorContext): MenuEntry[] =>
  Object.keys(DEFAULT_CONTENTS_KINDS).map((kind) =>
    entry(context, { id: kind, label: context.labels.contentsKind(kind) }, insertContents(kind)),
  );

// The template sections a writer may add, each started after the caret's block.
function sectionEntries(context: EditorContext, template: TemplateFile): MenuEntry[] {
  return (template.sections ?? [])
    .filter((section) => section.insertable === true)
    .map((section) =>
      entry(
        context,
        { id: `section-${section.name}`, label: section.label || section.name },
        insertDocumentSection(template, section.name),
      ),
    );
}

// The section menu, shown while the template has sections a writer may add.
const sectionItem = (labels: DocumentEditorLabels, features: InsertFeatures): ToolbarItem => ({
  kind: 'menu',
  id: 'section',
  label: labels.section,
  icon: LayoutAddBelowGlyph,
  entries: (context) => (features.template ? sectionEntries(context, features.template) : []),
  isVisible: () =>
    Boolean(features.template?.sections?.some((section) => section.insertable === true)),
});

// The items for what the host provides: abbreviations from its glossary and scripts it runs.
function hostItems(
  labels: DocumentEditorLabels,
  features: InsertFeatures,
  shortcuts: ShortcutTable,
): ToolbarItem[] {
  return [
    ...(features.glossary
      ? [
          {
            kind: 'button' as const,
            id: 'abbreviation',
            label: labels.abbreviation,
            icon: AbbreviationGlyph,
            run: (context: EditorContext) => context.openDialog({ kind: 'abbreviation' }),
            isEnabled: (context: EditorContext) =>
              context.editable &&
              !context.locked &&
              context.state.selection.$from.parent.inlineContent,
          },
        ]
      : []),
    ...(features.scripts
      ? [
          {
            kind: 'button' as const,
            id: 'script',
            label: labels.script,
            icon: TerminalGlyph,
            shortcut: shortcutLabel(shortcuts, 'script'),
            run: (context: EditorContext) => context.openDialog({ kind: 'script' }),
            isEnabled: (context: EditorContext) =>
              can(context, insertScriptBlock('')) && !scriptBlockAt(context.state),
          },
        ]
      : []),
  ];
}

/** The insert group's items after the table and the page break. */
export function insertItems(
  labels: DocumentEditorLabels,
  features: InsertFeatures,
  shortcuts: ShortcutTable,
): ToolbarItem[] {
  return [
    {
      kind: 'button',
      id: 'footnote',
      label: labels.footnote,
      icon: FootnoteGlyph,
      shortcut: shortcutLabel(shortcuts, 'footnote'),
      run: (context) => context.run(insertFootnote()),
      isEnabled: (context) => can(context, insertFootnote()),
    },
    {
      kind: 'menu',
      id: 'code-block',
      label: labels.insertCode,
      icon: CodeBlockGlyph,
      entries: (context) => codeEntries(context, features.linkedCode),
    },
    {
      kind: 'menu',
      id: 'math',
      label: labels.insertMath,
      icon: FormulaGlyph,
      entries: mathEntries,
    },
    figureItem(labels, features),
    {
      kind: 'menu',
      id: 'contents',
      label: labels.contents,
      icon: TableOfContentsGlyph,
      entries: contentsEntries,
    },
    {
      kind: 'menu',
      id: 'reference',
      label: labels.reference,
      icon: CrossReferenceGlyph,
      isEnabled: (context) =>
        context.editable && !context.locked && canInsertReference(context.state),
      entries: (context) => [
        {
          id: 'internal-reference',
          label: labels.internalReference,
          shortcut: shortcutLabel(shortcuts, 'reference'),
          onAction: () => context.openDialog({ kind: 'reference', reference: 'internal' }),
        },
        ...(features.references
          ? [
              {
                id: 'external-reference',
                label: labels.externalReference,
                onAction: () => context.openDialog({ kind: 'reference', reference: 'external' }),
              },
            ]
          : []),
      ],
    },
    ...hostItems(labels, features, shortcuts),
    sectionItem(labels, features),
    {
      kind: 'custom',
      id: 'symbol',
      render: (context) => <SymbolButton context={context} symbols={features.symbols} />,
    },
  ];
}
