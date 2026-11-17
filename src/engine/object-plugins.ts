// The editing's object plugins: math, object views (with the code's line numbers), scripts,
// embeds and checklists, in their places among the editing's plugins.

import type { RichTextPluginContribution } from '@flamboyantengineer/ui-components/rich-text-editor';
import { createChecklists } from './checklists.js';
import { createEmbeds } from './embeds.js';
import { createMathViews, type InvalidMathText } from './math-views.js';
import { createObjectViews, type LineNumbers } from './object-views.js';
import { createScripts } from './scripts.js';

/** The object plugins, with the code's line numbers and the text of math that does not typeset. */
export const objectPlugins = (options: {
  lineNumbers?: LineNumbers | undefined;
  invalidMath?: InvalidMathText | undefined;
}): RichTextPluginContribution[] => [
  {
    name: 'math-views',
    priority: 500,
    build: () => [createMathViews({ invalid: options.invalidMath })],
  },
  {
    name: 'object-views',
    priority: 505,
    build: () => [createObjectViews({ lineNumbers: options.lineNumbers })],
  },
  { name: 'scripts', priority: 512, build: () => [createScripts()] },
  { name: 'embeds', priority: 513, build: () => [createEmbeds()] },
  { name: 'checklists', priority: 514, build: () => [createChecklists()] },
];
