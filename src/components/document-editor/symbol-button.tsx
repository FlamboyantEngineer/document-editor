// The symbol picker of the toolbar's insert group: a button opening a grid of characters by
// category, shown in the font of the text at the caret, inserting the one picked.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  CharacterGrid,
  type CharacterGridCategory,
} from '@flamboyantengineer/ui-components/character-grid';
import { SpecialCharacterGlyph } from '@flamboyantengineer/ui-components/core';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { useState } from 'react';
import { insertCharacter } from '../../engine/index.js';
import type { EditorContext } from './editor-context.js';

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
  return (
    <PopoverTrigger isOpen={isOpen && context.editable} onOpenChange={setOpen}>
      <Button
        data-item="symbol"
        label={labels.symbol}
        tooltip={labels.symbol}
        size="sm"
        icon={SpecialCharacterGlyph}
        isDisabled={!context.canRun(insertCharacter('Ω'))}
      />
      <Popover placement="bottom start" aria-label={labels.symbol}>
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
      </Popover>
    </PopoverTrigger>
  );
}
