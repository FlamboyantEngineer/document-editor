// The template workspace's hooks, which its modules share.

import { createHooks } from '../../utils/hooks.js';

export const workspaceHooks = createHooks('template-workspace', [
  'band',
  'toolbar',
  'messages',
  'body',
  'main',
  'settings',
  'preview',
  'panel',
  'history',
  'open-dialog',
]);
