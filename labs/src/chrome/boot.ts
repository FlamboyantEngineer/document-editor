// Runs as a classic script in every lab page's head, before the body is parsed: it applies the
// stylesheet and theme at once, so the first paint already has them and nothing flashes unstyled.

import { bootLabSettings } from '@flamboyantengineer/ui-components/labs';
import { labStorage } from './storage.js';

bootLabSettings({ storage: labStorage() });
