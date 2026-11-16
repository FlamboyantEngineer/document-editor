// The symbol picker of the toolbar's insert group: a button opening a grid of characters by
// category, shown in the font of the text at the caret, inserting the one picked.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { CharacterGridCategory } from '@flamboyantengineer/ui-components/character-grid';
import { SpecialCharacterGlyph } from '@flamboyantengineer/ui-components/core';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { lazy, Suspense, useState } from 'react';
import { insertCharacter } from '../../engine/index.js';
import { type EditorContext, unavailableReason } from './editor-context.js';
import { SURFACE_LOADERS } from './lazy-surfaces.js';

// The grid loads the first time the picker opens, so the editor's own code does not carry it
// (DOCE-ENTRY-2.2).
const CharacterGrid = /* @__PURE__ */ lazy(async () => ({
  default: (await SURFACE_LOADERS.symbols()).CharacterGrid,
}));

// The font of the text at the caret, which the symbols show in.
function fontAtCaret({ view }: EditorContext): string | undefined {
  if (!view) return undefined;
  const { node } = view.domAtPos(view.state.selection.from);
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const window = element?.ownerDocument.defaultView;
  return element && window ? window.getComputedStyle(element).fontFamily || undefined : undefined;
}

/** The symbol picker: a button opening the characters, shown in the font at the caret. */
export function SymbolButton({
  context,
  symbols,
}: {
  context: EditorContext;
  symbols: readonly CharacterGridCategory[];
}) {
  const [isOpen, setOpen] = useState(false);
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
      <Popover placement="bottom start" aria-label={labels.symbol}>
        <Suspense fallback={null}>
          <CharacterGrid
            aria-label={labels.symbol}
            categories={symbols}
            fontFamily={isOpen ? fontAtCaret(context) : undefined}
            autoFocus
            onSelect={({ char }) => {
              setOpen(false);
              context.run(insertCharacter(char));
            }}
          />
        </Suspense>
      </Popover>
    </PopoverTrigger>
  );
}
