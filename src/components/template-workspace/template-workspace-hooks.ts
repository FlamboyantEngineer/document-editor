// The template workspace's hooks, which its modules share.

import { createHooks } from '../../utils/hooks.js';

export const workspaceHooks = createHooks('template-workspace', [
  'toolbar',
  'settings',
  'preview',
  'history',
]);
