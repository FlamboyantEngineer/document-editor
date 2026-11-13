// The comments panel's hooks, which the panel and its cards share.

import { createHooks } from '../../utils/hooks.js';

export const hooks = createHooks('comments-panel', ['thread', 'suggestion']);
