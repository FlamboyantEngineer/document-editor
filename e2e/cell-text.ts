// Where a table cell's text sits in the cell, as the pages draw it (DOCE-PAGINATION-10.5).

import type { Locator } from '@playwright/test';

/**
 * The room a cell's text leaves inside the cell's content box, left and right of its first line,
 * from the text's own boxes, as the pages draw it.
 */
export function textGaps(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const left = box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
    const right = box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
    // Every text box on the first line, each text node's own: an element's box, such as the
    // indent before a line's first character, is not text.
    const boxes: DOMRect[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(text);
      boxes.push(...Array.from(range.getClientRects()).filter((each) => each.width > 0));
    }
    if (boxes.length === 0) throw new Error('The cell text is not drawn');
    const top = Math.min(...boxes.map((each) => each.top));
    const first = boxes.filter((each) => each.top - top < 2);
    const line = {
      left: Math.min(...first.map((each) => each.left)),
      right: Math.max(...first.map((each) => each.right)),
    };
    return { left: line.left - left, right: right - line.right };
  });
}
