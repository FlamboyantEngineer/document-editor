// The toolbar items that insert objects at the selection: a footnote, code, math, a figure, a list
// of contents and a special character, and the link of the selected text. Items that need a
// dialog open the editor's; the rest run their command.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  CharacterGrid,
  type CharacterGridCategory,
} from '@flamboyantengineer/ui-components/character-grid';
import {
  CodeBlockGlyph,
  FormulaGlyph,
  ImageGlyph,
  LinkGlyph,
  ListTaskGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import type { Command } from 'prosemirror-state';
import { useState } from 'react';
import {
  canInsertReference,
  insertCharacter,
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
} from '../../engine/index.js';
import { DEFAULT_CONTENTS_KINDS, type TemplateFile } from '../../model/index.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
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

function SymbolButton({
  context,
  symbols,
}: {
  context: EditorContext;
  symbols: readonly CharacterGridCategory[];
}) {
  const [isOpen, setOpen] = useState(false);
  const { labels } = context;
  return (
    <PopoverTrigger isOpen={isOpen && context.editable} onOpenChange={setOpen}>
      <Button
        data-item="symbol"
        label={labels.symbol}
        tooltip={labels.symbol}
        size="sm"
        icon={<span>Ω</span>}
        isDisabled={!can(context, insertCharacter('Ω'))}
      />
      <Popover placement="bottom start" aria-label={labels.symbol}>
        <CharacterGrid
          aria-label={labels.symbol}
          categories={symbols}
          autoFocus
          onSelect={({ char }) => {
            setOpen(false);
            context.run(insertCharacter(char));
          }}
        />
      </Popover>
    </PopoverTrigger>
  );
}

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
    entry(context, { id: 'code-block', label: labels.codeBlock }, insertCodeBlock()),
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
  icon: <span>§§</span>,
  entries: (context) => (features.template ? sectionEntries(context, features.template) : []),
  isVisible: () =>
    Boolean(features.template?.sections?.some((section) => section.insertable === true)),
});

// The items for what the host provides: abbreviations from its glossary and scripts it runs.
function hostItems(labels: DocumentEditorLabels, features: InsertFeatures): ToolbarItem[] {
  return [
    ...(features.glossary
      ? [
          {
            kind: 'button' as const,
            id: 'abbreviation',
            label: labels.abbreviation,
            icon: <span>Ab</span>,
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
            icon: <span>{'{ }'}</span>,
            run: (context: EditorContext) => context.openDialog({ kind: 'script' }),
            isEnabled: (context: EditorContext) =>
              can(context, insertScriptBlock('')) && !scriptBlockAt(context.state),
          },
        ]
      : []),
  ];
}

/** The insert group's items after the table and the page break. */
export function insertItems(labels: DocumentEditorLabels, features: InsertFeatures): ToolbarItem[] {
  return [
    {
      kind: 'button',
      id: 'footnote',
      label: labels.footnote,
      icon: <span>¹</span>,
      shortcut: 'Ctrl+Alt+F',
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
    {
      kind: 'button',
      id: 'figure',
      label: labels.figure,
      icon: ImageGlyph,
      run: (context) => context.openDialog({ kind: 'figure' }),
      isEnabled: (context) => can(context, setFigure({ src: 'about:blank' })),
    },
    {
      kind: 'menu',
      id: 'contents',
      label: labels.contents,
      icon: ListTaskGlyph,
      entries: contentsEntries,
    },
    {
      kind: 'menu',
      id: 'reference',
      label: labels.reference,
      icon: <span>§</span>,
      isEnabled: (context) =>
        context.editable && !context.locked && canInsertReference(context.state),
      entries: (context) => [
        {
          id: 'internal-reference',
          label: labels.internalReference,
          shortcut: 'Ctrl+K',
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
    ...hostItems(labels, features),
    sectionItem(labels, features),
    {
      kind: 'custom',
      id: 'symbol',
      render: (context) => <SymbolButton context={context} symbols={features.symbols} />,
    },
  ];
}
