// The box a page's number or the page count takes in a page's body text (DOCE-PAGINATION-11.13).

import { ceilUnit } from './contents-row.js';
import { textWidth } from './metrics.js';

/** The width of the box a page variable is drawn in: its digits' zeros, to the layout unit. */
export function pageBoxWidth(digits: number, font: string): number {
  return ceilUnit(Math.max(1, Math.floor(digits)) * textWidth('0', font));
}
