import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import type { RegressionDocumentName } from '../labs/src/regression/regression-documents.js';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import type { PagesLayout } from '../src/document/index.js';
import { readDrawnLines, readDrawnPages } from './drawn-lines.js';
import { expect, test, waitForLab } from './fixtures.js';

// Edited pages match a fresh layout (specs/LABS.md DOCE-LABS-9): with `textLayout: 'pretext'`, after
// every step of a seeded sequence of edits (typing, IME composition, paste, undo and redo, splits
// and joins at line and page edges, deletes across pages, marks and styles that change the font,
// remote changes, zoom changes), what the editor draws equals what a new page draws when it opens the
// stored document afresh: the same pages' layout (pages, page breaks, split parts, every forced
// block's lines, numbers and variables), the same text on every page, and the editor's own drawn
// lines equal to its computed ones.

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

const FORCED = '.de-forced-lines';

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type Next = () => number;
const pick = <T>(next: Next, list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
const between = (next: Next, low: number, high: number) =>
  low + Math.floor(next() * (high - low + 1));

const WORDS =
  'the ridge station reports rainfall every morning and evening while Wavy Type fjords AVA TOY keep long words like state-of-the-art naïve café übergroße waffles'.split(
    ' ',
  );
const words = (next: Next, count: number) =>
  Array.from({ length: count }, () => pick(next, WORDS)).join(' ');

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    await document.fonts.ready;
    return window.stressLab.whenSettled();
  });

async function openLab(page: Page, name: RegressionDocumentName) {
  await page.goto(`regression.html?document=${name}&textLayout=pretext`);
  await waitForLab(page);
  await page.evaluate(() => window.regressionLab.drawAllLines(true));
  await settle(page);
}

// What a page draws, as the check compares it: its pages' layout, and the text of each page.
interface Drawn {
  readonly layout: PagesLayout | null;
  readonly pages: readonly string[];
}

const drawnOf = (page: Page): Promise<Drawn> =>
  page.evaluate(() => {
    const pages = [
      ...document.querySelectorAll(
        ':not(.de-document-viewer) > .de-document-editor__content .pm-page',
      ),
    ].map((each) => {
      const copy = each.cloneNode(true) as Element;
      for (const widget of copy.querySelectorAll('.ProseMirror-widget, .de-presence-caret'))
        widget.remove();
      return (copy.textContent ?? '').replaceAll(' ', ' ');
    });
    return { layout: window.regressionLab.layout(), pages };
  });

// The editor's drawn lines against its computed ones, as the one-result invariant reads them.
async function lineMismatches(page: Page) {
  const computed = await page.evaluate(() => window.regressionLab.textLines());
  const drawn = await readDrawnPages(page, FORCED);
  const problems: string[] = [];
  if (drawn.pages !== computed.length)
    problems.push(`pages drawn ${String(drawn.pages)}, computed ${String(computed.length)}`);
  const asked = computed.flatMap(({ blocks }, index) =>
    blocks.flatMap((block) =>
      block.lines
        ? [
            {
              page: index,
              elementId: block.elementId,
              part: block.part,
              lines: block.lines.map((line) => line.text.replaceAll(' ', ' ')),
            },
          ]
        : [],
    ),
  );
  const lines = await readDrawnLines(page, asked);
  asked.forEach((block, index) => {
    const own = lines[index]?.map((text) => text.replaceAll(' ', ' ')) ?? null;
    const same =
      own !== null &&
      own.length === block.lines.length &&
      own.every((text, at) => text === block.lines[at]);
    if (!same)
      problems.push(
        `page ${String(block.page)} ${block.elementId}#${String(block.part)}: drawn ${JSON.stringify(own)} computed ${JSON.stringify(block.lines)}`,
      );
  });
  return problems;
}

// The first places two values differ, as paths.
function differences(a: unknown, b: unknown, path = '', found: string[] = []): string[] {
  if (found.length >= 6) return found;
  if (Object.is(a, b)) return found;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    found.push(
      `${path || '.'}: ${JSON.stringify(a)?.slice(0, 160)} != ${JSON.stringify(b)?.slice(0, 160)}`,
    );
    return found;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys)
    differences(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      `${path}.${key}`,
      found,
    );
  return found;
}

/** A fresh page that opens a stored document as a new page would. */
async function freshLayout(context: BrowserContext, name: RegressionDocumentName, page: Page) {
  const stored = await page.evaluate(() => window.regressionLab.stored());
  const fresh = await context.newPage();
  try {
    await openLab(fresh, name);
    await fresh.evaluate((file) => {
      if (file) window.regressionLab.load(file);
    }, stored);
    await fresh.waitForFunction(() => window.regressionLab.layout() !== null);
    await fresh.evaluate(() => window.regressionLab.drawAllLines(true));
    await settle(fresh);
    return await drawnOf(fresh);
  } finally {
    await fresh.close();
  }
}

/** A step of an editing sequence, with a label the failure names. */
interface Step {
  readonly label: string;
  run(page: Page, cdp: CDPSession): Promise<void>;
}

const ranges = (page: Page) => page.evaluate(() => window.regressionLab.textRanges());

async function caretAt(page: Page, next: Next): Promise<number | null> {
  const all = await ranges(page);
  if (all.length === 0) return null;
  const [from, to] = pick(next, all);
  const at = between(next, from, to);
  await page.evaluate((position) => window.regressionLab.caretAtJoined(position), at);
  return at;
}

// The steps a sequence draws from, each with its weight.
const STEPS: readonly [number, (next: Next) => Step][] = [
  [
    6,
    (next) => {
      const text = ` ${words(next, between(next, 1, 12))}`;
      return {
        label: `type ${JSON.stringify(text)}`,
        run: async (page) => {
          await caretAt(page, next);
          await page.keyboard.type(text);
        },
      };
    },
  ],
  [
    3,
    (next) => {
      const key = pick(next, ['Enter', 'Shift+Enter']);
      return {
        label: key,
        run: async (page) => {
          await caretAt(page, next);
          await page.keyboard.press(key);
        },
      };
    },
  ],
  [
    3,
    (next) => {
      const key = pick(next, ['Backspace', 'Delete']);
      const count = between(next, 1, 25);
      return {
        label: `${key} x${String(count)}`,
        run: async (page) => {
          await caretAt(page, next);
          for (let index = 0; index < count; index += 1) await page.keyboard.press(key);
        },
      };
    },
  ],
  [
    2,
    (next) => {
      const share = next() * 0.3;
      return {
        label: `delete a range of ${String(Math.round(share * 100))}%`,
        run: async (page) => {
          const all = await ranges(page);
          if (all.length === 0) return;
          const first = pick(next, all);
          const last =
            all[Math.min(all.length - 1, all.indexOf(first) + Math.ceil(share * all.length))] ??
            first;
          const from = between(next, first[0], first[1]);
          const to = between(next, last[0], last[1]);
          if (to <= from) return;
          await page.evaluate(([a, b]) => window.regressionLab.selectJoined(a, b), [
            from,
            to,
          ] as const);
          await page.keyboard.press('Backspace');
        },
      };
    },
  ],
  [
    3,
    (next) => {
      const type = pick(next, [
        'paragraph',
        'table',
        'bullet_list',
        'ordered_list',
        'code_block',
        'heading',
      ]);
      const edge = pick(next, ['head-end', 'continuation-start'] as const);
      const action = pick(next, ['type', 'Enter', 'Backspace', 'Delete']);
      const text = ` ${words(next, between(next, 1, 6))}`;
      return {
        label: `${action} at a ${type} page edge (${edge})`,
        run: async (page) => {
          const caret = await page.evaluate(
            ([t, e]) => window.regressionLab.caretAtFragment(t, e),
            [type, edge] as const,
          );
          if (!caret) {
            await caretAt(page, next);
          }
          if (action === 'type') await page.keyboard.type(text);
          else await page.keyboard.press(action);
        },
      };
    },
  ],
  [
    2,
    (next) => {
      const end = pick(next, ['End', 'Home']);
      const action = pick(next, ['type', 'Enter', 'Backspace', 'Delete']);
      const text = pick(next, [' ', ' AVA', 'x', ` ${words(next, 3)}`]);
      return {
        label: `${action} at the line's ${end}`,
        run: async (page) => {
          await caretAt(page, next);
          await page.keyboard.press(end);
          if (action === 'type') await page.keyboard.type(text);
          else await page.keyboard.press(action);
        },
      };
    },
  ],
  [
    3,
    (next) => {
      const key = pick(next, [
        'Control+b',
        'Control+i',
        'Control+Alt+i',
        'Control+.',
        'Control+Shift+1',
        'Control+Shift+2',
        'Control+Shift+0',
      ]);
      const length = between(next, 1, 120);
      return {
        label: `${key} over ${String(length)}`,
        run: async (page) => {
          const at = await caretAt(page, next);
          if (at === null) return;
          await page.evaluate(([a, b]) => window.regressionLab.selectJoined(a, b), [
            at,
            at,
          ] as const);
          const all = await ranges(page);
          const block = all.find(([from, to]) => at >= from && at <= to);
          const to = Math.min(block?.[1] ?? at, at + length);
          await page.evaluate(([a, b]) => window.regressionLab.selectJoined(a, b), [
            at,
            to,
          ] as const);
          await page.keyboard.press(key);
        },
      };
    },
  ],
  [
    3,
    (next) => {
      const count = between(next, 1, 6);
      const redo = between(next, 0, count);
      return {
        label: `undo x${String(count)}, redo x${String(redo)}`,
        run: async (page) => {
          for (let index = 0; index < count; index += 1) await page.keyboard.press('Control+z');
          for (let index = 0; index < redo; index += 1)
            await page.keyboard.press('Control+Shift+z');
        },
      };
    },
  ],
  [
    2,
    (next) => {
      const paragraphs = Array.from({ length: between(next, 1, 3) }, () =>
        words(next, between(next, 3, 40)),
      );
      const html = next() < 0.5;
      return {
        label: `paste ${html ? 'HTML' : 'text'} of ${String(paragraphs.length)} paragraphs`,
        run: async (page) => {
          await caretAt(page, next);
          await page.evaluate(
            ([parts, asHtml]) => {
              const data = new DataTransfer();
              data.setData('text/plain', parts.join('\n\n'));
              if (asHtml)
                data.setData(
                  'text/html',
                  parts
                    .map((part, index) => (index % 2 ? `<p><b>${part}</b></p>` : `<p>${part}</p>`))
                    .join(''),
                );
              const target = document.activeElement ?? document.body;
              target.dispatchEvent(
                new ClipboardEvent('paste', {
                  clipboardData: data,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            },
            [paragraphs, html] as const,
          );
        },
      };
    },
  ],
  [
    2,
    (next) => {
      const word = pick(next, ['にほんご', 'かんじ', 'ありがとう', 'café']);
      const commit = next() < 0.8;
      return {
        label: `IME ${commit ? 'commits' : 'cancels'} ${word}`,
        run: async (page, cdp) => {
          await caretAt(page, next);
          for (let index = 1; index <= word.length; index += 1) {
            const text = word.slice(0, index);
            await cdp.send('Input.imeSetComposition', {
              text,
              selectionStart: text.length,
              selectionEnd: text.length,
            });
          }
          if (commit) await cdp.send('Input.insertText', { text: word });
          else
            await cdp.send('Input.imeSetComposition', {
              text: '',
              selectionStart: 0,
              selectionEnd: 0,
            });
        },
      };
    },
  ],
  [
    3,
    (next) => {
      const insert = next() < 0.6;
      const text = ` ${words(next, between(next, 1, 15))}`;
      const length = between(next, 1, 60);
      return {
        label: insert ? `remote insert ${JSON.stringify(text)}` : `remote delete ${String(length)}`,
        run: async (page) => {
          const all = await ranges(page);
          if (all.length === 0) return;
          const [from, to] = pick(next, all);
          const at = between(next, from, to);
          await page.evaluate(
            (change) => window.regressionLab.remote(change),
            insert
              ? { kind: 'insert' as const, at, text }
              : { kind: 'delete' as const, from: at, to: Math.min(to, at + length) },
          );
        },
      };
    },
  ],
  [
    1,
    (next) => {
      const zoom = pick(next, [50, 75, 90, 110, 125, 150, 100]);
      return {
        label: `zoom ${String(zoom)}%`,
        run: async (page) => {
          await page.evaluate((percent) => window.regressionLab.setZoom(percent), zoom);
        },
      };
    },
  ],
];

const TOTAL = STEPS.reduce((sum, [weight]) => sum + weight, 0);

function drawStep(next: Next): Step {
  let at = next() * TOTAL;
  for (const [weight, make] of STEPS) {
    at -= weight;
    if (at < 0) return make(next);
  }
  return (STEPS[0] as (typeof STEPS)[number])[1](next);
}

const DOCUMENTS: readonly RegressionDocumentName[] = [
  'oversized-blocks',
  'long-mixed',
  'footnote-heavy',
  'footnotes-in-structures',
  'table-long-repeated-header',
  'table-rich-cells',
  'heading-keep-with-next',
  'list-split-stress',
  'caption-numbering',
  'mixed-geometry',
];

const SEEDS = Number(process.env.EDIT_LAYOUT_SEEDS ?? 2);
const LENGTH = Number(process.env.EDIT_LAYOUT_STEPS ?? 12);
const FIRST_SEED = Number(process.env.EDIT_LAYOUT_FIRST_SEED ?? 1);

test.describe('DOCE-LABS-9.1 edited pages equal a fresh layout of the stored document', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
  for (const name of DOCUMENTS) {
    for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed += 1) {
      test(`DOCE-LABS-9.1 ${name}, seed ${String(seed)}`, async ({ page, context }) => {
        test.setTimeout(240_000);
        const next = random(seed * 7919 + name.length);
        const cdp = await context.newCDPSession(page);
        await openLab(page, name);
        const done: string[] = [];
        for (let index = 0; index < LENGTH; index += 1) {
          const step = drawStep(next);
          await step.run(page, cdp);
          done.push(step.label);
          await page.evaluate(() => window.regressionLab.drawAllLines(true));
          await settle(page);
          const edited = await drawnOf(page);
          const fresh = await freshLayout(context, name, page);
          const problems = [
            ...(await lineMismatches(page)),
            ...differences(edited.layout, fresh.layout, 'layout'),
            ...differences(edited.pages, fresh.pages, 'page text'),
          ];
          expect(
            problems,
            `after ${done.map((label, at) => `${String(at + 1)}. ${label}`).join('; ')}`,
          ).toEqual([]);
        }
      });
    }
  }
});
