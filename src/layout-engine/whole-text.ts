// A text atom's text as the stylesheet draws it, whole and with its white space collapsed
// (`white-space: nowrap`, DOCE-PAGINATION-9.5). Pretext lays an unbreakable item out collapsed too,
// but trims a space at either end, which the page keeps: each such space is added as width, the
// one at its end hanging at a line's end, as the page's does.

import type { RichInlineItem } from '@chenglou/pretext/rich-inline';
import { textWidth } from './metrics.js';

/** An unbreakable text item as the page draws it, with its white space collapsed. */
export function wholeText(item: RichInlineItem): RichInlineItem | { readonly width: number } {
  const collapsed = item.text.replace(/[ \t\n\r\f]+/gu, ' ');
  const core = collapsed.trim();
  const space = textWidth(' ', item.font);
  if (!core) return { width: collapsed ? space : 0 };
  const start = collapsed.startsWith(' ') ? space : 0;
  const end = collapsed.endsWith(' ') ? space : 0;
  if (core === item.text) return item;
  const own = { ...item, text: core };
  if (!start && !end) return own;
  // An item padded as inline code keeps its own padding with the spaces'.
  return {
    ...own,
    extraWidth: (item.extraWidth ?? 0) + start + end,
    extraWidthEnd: (item.extraWidthEnd ?? 0) + end,
  };
}
