// Comparing stored values, such as two versions of a block, by what they hold.

import { stableKey } from '../utils/stable-key.js';

/** Whether two stored values hold the same content, whatever order their keys are in. */
export const sameStored = (one: unknown, other: unknown): boolean =>
  stableKey(one) === stableKey(other);
