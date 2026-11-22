// The numbers the pages drew before their headings, captions and display equations: the text the
// browser laid out for each generated `::before` and `::after`, read from a DOM snapshot, since a
// counter's value reaches no DOM or style API.

import type { Page } from '@playwright/test';

interface Snapshot {
  readonly strings: string[];
  readonly documents: {
    readonly nodes: {
      readonly parentIndex: number[];
      readonly nodeName: number[];
      readonly attributes: number[][];
      readonly pseudoType?: { readonly index: number[] };
    };
    readonly layout: { readonly nodeIndex: number[]; readonly text: number[] };
  }[];
}

const NUMBERED = /^(H[1-6])$|doc-(table|figure|code|linked-code)-caption-line|de-math/u;

// The numbers drawn on the editor's page of an index, in document order.
async function numbersOnPage(page: Page, target: number): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const snapshot = (await cdp.send('DOMSnapshot.captureSnapshot', {
    computedStyles: [],
  })) as unknown as Snapshot;
  await cdp.detach();
  const [doc] = snapshot.documents;
  if (!doc) return [];
  const { nodes, layout } = doc;
  const string = (index: number | undefined) =>
    index !== undefined && index >= 0 ? (snapshot.strings[index] ?? '') : '';
  const attribute = (node: number, name: string) => {
    const pairs = nodes.attributes[node] ?? [];
    for (let at = 0; at < pairs.length; at += 2)
      if (string(pairs[at]) === name) return string(pairs[at + 1]);
    return null;
  };
  const pseudo = new Set(nodes.pseudoType?.index ?? []);
  const classes = (node: number) => (attribute(node, 'class') ?? '').split(' ');
  const inContent = (node: number) => {
    for (let at = node; at >= 0; at = nodes.parentIndex[at] ?? -1)
      if (classes(at).includes('de-document-editor__content')) return true;
    return false;
  };
  const pages = nodes.parentIndex.flatMap((_parent, node) =>
    classes(node).includes('pm-page') && inContent(node) ? [node] : [],
  );
  const wanted = pages[target];
  const onProbe = (node: number) => {
    for (let at = node; at >= 0; at = nodes.parentIndex[at] ?? -1) if (at === wanted) return true;
    return false;
  };
  const texts = new Map<number, string>();
  layout.nodeIndex.forEach((node, index) => {
    const text = string(layout.text[index]);
    // The generated text sits in the pseudo element, or a level or two below it.
    let at = node;
    for (let depth = 0; depth < 3 && at >= 0 && !pseudo.has(at); depth += 1)
      at = nodes.parentIndex[at] ?? -1;
    const owner = at >= 0 && pseudo.has(at) ? (nodes.parentIndex[at] ?? -1) : -1;
    if (!text || owner < 0) return;
    const name = `${string(nodes.nodeName[owner])} ${attribute(owner, 'class') ?? ''}`;
    if (!NUMBERED.test(name.trim().split(' ')[0] ?? '') && !NUMBERED.test(name)) return;
    if (!onProbe(owner)) return;
    texts.set(owner, (texts.get(owner) ?? '') + text);
  });
  return [...texts.values()].map((text) => text.trim()).filter(Boolean);
}

/** The numbers each page drew, scrolling each into view so the browser lays it out. */
export async function drawnNumbers(page: Page): Promise<string[][]> {
  const pages = page.locator('.de-document-editor__content .pm-page');
  const found: string[][] = [];
  for (let index = 0; index < (await pages.count()); index += 1) {
    const each = pages.nth(index);
    await each.scrollIntoViewIfNeeded();
    await each.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    found.push(await numbersOnPage(page, index));
  }
  return found;
}
