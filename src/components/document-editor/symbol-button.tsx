// The symbol picker of the toolbar's insert group: a button opening a grid of characters by
// category, shown in the font of the text at the caret, inserting the one picked.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { CharacterGridCategory } from '@flamboyantengineer/ui-components/character-grid';
import { SpecialCharacterGlyph } from '@flamboyantengineer/ui-components/core';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { lazy, Suspense } from 'react';
import { insertCharacter } from '../../engine/index.js';
import { type EditorContext, unavailableReason } from './editor-context.js';
import { SURFACE_LOADERS } from './lazy-surfaces.js';
import { usePopoverCommand } from './popover-command.js';

// The grid loads the first time the picker opens, so the editor's own code does not carry it
// (DOCE-ENTRY-2.2).
const CharacterGrid = /* @__PURE__ */ lazy(async () => ({
  default: (await SURFACE_LOADERS.symbols()).CharacterGrid,
}));

// The font of the text at the caret, which the symbols show in.
// The look of the text at the caret, which the characters show in.
function lookAtCaret({ view }: EditorContext) {
  if (!view) return {};
  const { node } = view.domAtPos(view.state.selection.from);
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const window = element?.ownerDocument.defaultView;
  if (!element || !window) return {};
  const style = window.getComputedStyle(element);
  return {
    fontFamily: style.fontFamily || undefined,
    fontWeight: style.fontWeight || undefined,
    fontStyle: style.fontStyle || undefined,
    color: style.color || undefined,
  };
}

// The symbols' grid is eight characters wide.
const COLUMNS = 8;

/** The symbol picker: a button opening the characters, eight to a row, in the look of the text at the caret. */
export function SymbolButton({
  context,
  symbols,
}: {
  context: EditorContext;
  symbols: readonly CharacterGridCategory[];
}) {
  const { isOpen, setOpen, choose } = usePopoverCommand(context);
  const { labels } = context;
  const isDisabled = !context.canRun(insertCharacter('Ω'));
  // Disabled, the button stays focusable and says why in its tooltip, as the toolbar's buttons do.
  const reason = isDisabled ? unavailableReason(context) : undefined;
  return (
    <PopoverTrigger isOpen={isOpen && !isDisabled} onOpenChange={setOpen}>
      <Button
        data-item="symbol"
        label={labels.symbol}
        tooltip={reason === undefined ? labels.symbol : `${labels.symbol}: ${reason}`}
        size="sm"
        icon={SpecialCharacterGlyph}
        isDisabled={isDisabled}
        focusableWhenDisabled={reason !== undefined}
      />
      <Popover placement="bottom start" aria-label={labels.symbol} isNonModal>
        <Suspense fallback={null}>
          <CharacterGrid
            aria-label={labels.symbol}
            categories={symbols}
            {...(isOpen ? lookAtCaret(context) : {})}
            columns={COLUMNS}
            autoFocus
            onSelect={({ char }) => {
              choose(insertCharacter(char));
            }}
          />
        </Suspense>
      </Popover>
    </PopoverTrigger>
  );
}
