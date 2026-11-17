// The toolbar's own controls: the text style of the selected blocks and the table button with its
// grid. Each reflects the selection and is disabled while its command cannot run.

import { Button } from '@flamboyantengineer/ui-components/button';
import { type Key, TableGlyph } from '@flamboyantengineer/ui-components/core';
import { GridSizePicker } from '@flamboyantengineer/ui-components/grid-size-picker';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import type { EditorState } from 'prosemirror-state';
import { type CSSProperties, memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { customStyleAt, insertTable, shortcutsOf } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import { blockStyle, blockStyles } from './block-styles.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { usePopoverCommand } from './popover-command.js';

// The toolbar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['block-style', 'style-preview']);

// The template properties a text style preview reads: the paragraph's and the headings'.
function previewProperties(templateStyle: Readonly<Record<string, string>>): CSSProperties {
  return Object.fromEntries(
    Object.entries(templateStyle).filter(([name]) => PREVIEW_PROPERTY.test(name)),
  ) as CSSProperties;
}

const PREVIEW_PROPERTY = /^--doc-(paragraph|heading-[1-6])-/;

// The text styles the field offers, the same while the schema, the labels and the styles are.
function useBlockStyles(
  state: EditorState,
  labels: DocumentEditorLabels,
  customStyles: readonly string[],
) {
  const { schema } = state;
  const shortcuts = shortcutsOf(state);
  return useMemo(
    () => blockStyles(schema, labels, { shortcuts, customStyles }),
    [schema, labels, shortcuts, customStyles],
  );
}

// The field as a state shows it: drawn again only when the style shown, whether it can be changed,
// or the styles offered change, not for each key typed in a block (DOCE-EDITOR-1.7).
const BlockStyleField = memo(function BlockStyleField({
  value,
  isCustom,
  isDisabled,
  labels,
  options,
  preview,
  onChoose,
}: {
  value: string | null;
  isCustom: boolean;
  isDisabled: boolean;
  labels: DocumentEditorLabels;
  options: readonly { id: string; label: string; shortcut: string | undefined }[];
  preview: CSSProperties;
  onChoose: (key: Key | null) => void;
}) {
  return (
    <SelectField
      // The style picked shows in its own look while the field is closed, too.
      {...hooks.slot('block-style', { 'block-style': isCustom ? 'custom' : value })}
      size="sm"
      density="compact"
      label={labels.blockType}
      labelLayout="control-only"
      placeholder={labels.blockType}
      options={options}
      renderOption={(option) => (
        // Each style's name in the style it sets, but for its size.
        <span {...hooks.slot('style-preview')} data-block-style={option.id} style={preview}>
          {option.label}
        </span>
      )}
      value={value}
      tracksChanges={false}
      onChange={onChoose}
      isDisabled={isDisabled}
    />
  );
});

/** The text style field, its options previewed in the template's look. */
export function BlockStyleSelect({
  context,
  templateStyle,
  customStyles,
}: {
  context: EditorContext;
  templateStyle: Readonly<Record<string, string>>;
  customStyles: readonly string[];
}) {
  const { labels } = context;
  const styles = useBlockStyles(context.state, labels, customStyles);
  const options = useMemo(
    () => styles.map(({ id, label, shortcut }) => ({ id, label, shortcut })),
    [styles],
  );
  const preview = useMemo(() => previewProperties(templateStyle), [templateStyle]);
  const custom = customStyleAt(context.state);
  // A choice runs on the context drawn last.
  const latest = useRef(context);
  useLayoutEffect(() => {
    latest.current = context;
  });
  const choose = useCallback(
    (key: Key | null) => {
      const style = styles.find((each) => each.id === key);
      if (style) latest.current.run(style.command);
    },
    [styles],
  );
  return (
    <BlockStyleField
      value={custom ? `custom:${custom}` : blockStyle(context.state)}
      isCustom={Boolean(custom)}
      isDisabled={!context.editable || context.locked}
      labels={labels}
      options={options}
      preview={preview}
      onChoose={choose}
    />
  );
}

/** The table button, opening the grid that sizes a new table. */
export function TableButton({ context }: { context: EditorContext }) {
  const { isOpen, setOpen, choose } = usePopoverCommand(context);
  const { labels } = context;
  return (
    <PopoverTrigger isOpen={isOpen && context.editable} onOpenChange={setOpen}>
      <Button
        icon={TableGlyph}
        label={labels.insertTable}
        tooltip={isOpen ? labels.insertTableHint : labels.insertTable}
        size="sm"
        isDisabled={!context.canRun(insertTable({ rows: 1, columns: 1 }))}
      />
      <Popover placement="bottom start" aria-label={labels.insertTable} isNonModal>
        <GridSizePicker
          aria-label={labels.insertTable}
          autoFocus
          onSelect={({ rows, columns }) => {
            choose(insertTable({ rows, columns }));
          }}
        />
      </Popover>
    </PopoverTrigger>
  );
}
