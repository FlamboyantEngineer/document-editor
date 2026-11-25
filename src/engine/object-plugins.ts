// The editing's object plugins: math, object views (with the code's line numbers), scripts,
// embeds and checklists, in their places among the editing's plugins.

import type { RichTextPluginContribution } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { TemplateFile } from '../model/index.js';
import { createChecklists } from './checklists.js';
import { createEmbeds } from './embeds.js';
import { createMathViews, type InvalidMathText, type MathViewsOptions } from './math-views.js';
import { createObjectViews } from './object-views.js';
import { createScripts } from './scripts.js';

/** How the editing's math views typeset math, beside what invalid math shows (`invalidMath`). */
export type EditingMathOptions = Omit<MathViewsOptions, 'invalid'>;

/**
 * The object plugins, with the code's line numbers the template states (`styles.codeBlock`, all
 * code by default) and the text of math that does not typeset.
 */
export const objectPlugins = (options: {
  template?: (() => TemplateFile) | undefined;
  invalidMath?: InvalidMathText | undefined;
  math?: EditingMathOptions | undefined;
}): RichTextPluginContribution[] => [
  {
    name: 'math-views',
    priority: 500,
    build: () => [createMathViews({ ...options.math, invalid: options.invalidMath })],
  },
  {
    name: 'object-views',
    priority: 505,
    build: () => [
      createObjectViews({
        lineNumbers: options.template?.().styles?.codeBlock?.lineNumbers ?? 'all',
      }),
    ],
  },
  { name: 'scripts', priority: 512, build: () => [createScripts()] },
  { name: 'embeds', priority: 513, build: () => [createEmbeds()] },
  { name: 'checklists', priority: 514, build: () => [createChecklists()] },
];
