// The layout and input APIs the editor engine calls and jsdom does not implement: input events'
// target ranges, hit testing and range geometry (every rect is empty).

import { beforeAll } from 'vitest';

function emptyRect(): DOMRect {
  return new DOMRect(0, 0, 0, 0);
}

/** Fills in the browser APIs a rendered editor needs for the tests of one file. */
export function installEditorDom(): void {
  beforeAll(() => {
    const input = InputEvent.prototype as InputEvent & { getTargetRanges?: () => StaticRange[] };
    input.getTargetRanges ??= () => [];
    document.elementFromPoint ??= () => document.body;
    Document.prototype.elementFromPoint ??= () => document.body;
    Range.prototype.getClientRects ??= () =>
      Object.assign([emptyRect()], { item: () => emptyRect() }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect ??= emptyRect;
  });
}
