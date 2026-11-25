// A fonts host for the editor's tests: HarfBuzz and Arimo's faces read from the dev dependencies,
// served under every family asked for and each generic keyword, so the pages are laid out by the
// layout engine, as a host that serves its fonts has them (DOCE-HOST-1.14.1).

import type { FontsAdapter } from '../src/host/index.js';
import { fontsourceFaces, harfBuzzWasm } from './font-files-node.js';

// The family each generic keyword stands for.
const GENERICS = { serif: 'Test Serif', 'sans-serif': 'Test Sans', monospace: 'Test Mono' };

const named = (family: string) => GENERICS[family as keyof typeof GENERICS] ?? family;

/** Serves Arimo's faces under each family asked for, and HarfBuzz to shape them. */
export const TEST_FONTS: FontsAdapter = {
  load: (families) => Promise.resolve({ ok: true, value: families }),
  shaper: () => Promise.resolve({ ok: true, value: harfBuzzWasm() }),
  files: (families) =>
    Promise.resolve({
      ok: true,
      value: {
        faces: [...new Set(families.map(named))].flatMap((family) =>
          fontsourceFaces('arimo', family).map(({ italic, ...face }) => ({
            ...face,
            style: italic ? 'italic' : 'normal',
          })),
        ),
        generics: GENERICS,
      },
    }),
};
