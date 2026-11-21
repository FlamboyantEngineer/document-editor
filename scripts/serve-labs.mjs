#!/usr/bin/env node
// Run the installed lab server with this checkout's directory and default starting port.
import ui from '@flamboyantengineer/ui-components/package.json' with { type: 'json' };
import { LABS_PORT, root } from './lib/labs.mjs';

process.chdir(root);
process.env.LABS_PORT ??= String(LABS_PORT);
await import(
  new URL(
    ui.bin['ui-components-labs'],
    import.meta.resolve('@flamboyantengineer/ui-components/package.json'),
  ).href
);
