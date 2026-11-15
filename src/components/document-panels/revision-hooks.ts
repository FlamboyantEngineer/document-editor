// The styling hooks of the editor's revision list, its rows, toolbar and dialogs.
import { createHooks } from '../../utils/hooks.js';

/** `de-revision-list` and its slots. */
export const revisionHooks = createHooks('revision-list', [
  'toolbar',
  'error',
  'list',
  'empty',
  'row',
  'fold',
  'title',
  'current',
  'meta',
  'summary',
  'actions',
  'dialog',
]);
