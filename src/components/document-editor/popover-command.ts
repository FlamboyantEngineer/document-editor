// A toolbar popover that runs a command once the writer chooses in it: the command runs after the
// popover has closed, so focus returns to the document rather than to the button that opened it.

import type { Command } from 'prosemirror-state';
import { useEffect, useRef, useState } from 'react';
import type { EditorContext } from './editor-context.js';

/** The open state of a toolbar popover, and `choose`, which closes it and then runs a command. */
export function usePopoverCommand(context: EditorContext) {
  const [isOpen, setOpen] = useState(false);
  const pending = useRef<Command | null>(null);
  useEffect(() => {
    const command = pending.current;
    if (isOpen || !command) return;
    pending.current = null;
    context.run(command);
  }, [isOpen, context]);
  const choose = (command: Command) => {
    pending.current = command;
    setOpen(false);
  };
  return { isOpen, setOpen, choose };
}
