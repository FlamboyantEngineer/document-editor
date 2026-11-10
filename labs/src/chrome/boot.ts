// Runs as a classic script in every lab page's head, before the body is parsed: it applies the
// stylesheet and theme at once, so the first paint already has them and nothing flashes unstyled.

import { applySettings, labStorage, readSettings } from './settings.js';

applySettings(readSettings(location.search, labStorage()));
