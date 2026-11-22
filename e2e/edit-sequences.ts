import type { CDPSession, Page } from '@playwright/test';
import type { PageTextLines } from '../src/pagination/index.js';
import { type PagesIn, readDrawnLines, readDrawnPages } from './drawn-lines.js';

// Seeded edit sequences for the checks that edited pages equal a fresh layout (specs/LABS.md
// DOCE-LABS-9): the steps a sequence draws from, each acting on an editor through its lab's probe
// (`EditTarget`), and what the checks compare: the drawn lines against the computed ones, and two
// values' first differences.

const FORCED = '.de-forced-lines';

export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export type Next = () => number;
export const pick = <T>(next: Next, list: readonly T[]): T =>
  list[Math.floor(next() * list.length)] as T;
export const between = (next: Next, low: number, high: number) =>
  low + Math.floor(next() * (high - low + 1));

const WORDS =
  'the ridge station reports rainfall every morning and evening while Wavy Type fjords AVA TOY keep long words like state-of-the-art naïve café übergroße waffles'.split(
    ' ',
  );
export const words = (next: Next, count: number) =>
  Array.from({ length: count }, () => pick(next, WORDS)).join(' ');

/** The editor's drawn lines against its computed ones, as the one-result invariant reads them. */
export async function lineMismatches(
  page: Page,
  computed: readonly PageTextLines[],
  pagesIn: PagesIn = 'editor',
): Promise<string[]> {
  const drawn = await readDrawnPages(page, FORCED, pagesIn);
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
  const lines = await readDrawnLines(page, asked, pagesIn);
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

/** The first places two values differ, as paths. */
export function differences(a: unknown, b: unknown, path = '', found: string[] = []): string[] {
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

/** Another writer's change, at positions of the document with its pages joined whole. */
export type OtherChange =
  | { readonly kind: 'insert'; readonly at: number; readonly text: string }
  | { readonly kind: 'delete'; readonly from: number; readonly to: number };

/** The editor a sequence edits, through its lab's probe; keys go to the page. */
export interface EditTarget {
  readonly page: Page;
  readonly cdp: CDPSession;
  /** Each text block's content range, in the document with its pages joined whole. */
  ranges(): Promise<[number, number][]>;
  /** Selects, focused, between two positions; a caret when they are equal. */
  select(from: number, to: number): Promise<void>;
  /** Puts the caret at a fragment boundary of a split block of a type; false when none is split. */
  caretAtFragment(type: string, edge: 'head-end' | 'continuation-start'): Promise<boolean>;
  /** Another writer's change, outside this writer's undo history. */
  other(change: OtherChange): Promise<void>;
  /** Sets the zoom in percent. */
  zoom(percent: number): Promise<void>;
}

/** A step of an editing sequence, with a label the failure names. */
export interface Step {
  readonly label: string;
  run(target: EditTarget): Promise<void>;
}

/** Runs a sequence's last step; a step that throws names the steps so far. */
export async function runStep(step: Step, target: EditTarget, done: readonly string[]) {
  try {
    await step.run(target);
  } catch (error) {
    const steps = done.map((label, at) => `${String(at + 1)}. ${label}`).join('; ');
    throw new Error(`${String(error)} at ${steps}`, { cause: error });
  }
}

async function caretAt(target: EditTarget, next: Next): Promise<number | null> {
  const all = await target.ranges();
  if (all.length === 0) return null;
  const [from, to] = pick(next, all);
  const at = between(next, from, to);
  await target.select(at, at);
  return at;
}

/** The steps a sequence draws from, each with its weight. */
export const STEPS: readonly [number, (next: Next) => Step][] = [
  [
    6,
    (next) => {
      const text = ` ${words(next, between(next, 1, 12))}`;
      return {
        label: `type ${JSON.stringify(text)}`,
        run: async (target) => {
          await caretAt(target, next);
          await target.page.keyboard.type(text);
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
        run: async (target) => {
          await caretAt(target, next);
          await target.page.keyboard.press(key);
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
        run: async (target) => {
          await caretAt(target, next);
          for (let index = 0; index < count; index += 1) await target.page.keyboard.press(key);
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
        run: async (target) => {
          const all = await target.ranges();
          if (all.length === 0) return;
          const first = pick(next, all);
          const last =
            all[Math.min(all.length - 1, all.indexOf(first) + Math.ceil(share * all.length))] ??
            first;
          const from = between(next, first[0], first[1]);
          const to = between(next, last[0], last[1]);
          if (to <= from) return;
          await target.select(from, to);
          await target.page.keyboard.press('Backspace');
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
        run: async (target) => {
          if (!(await target.caretAtFragment(type, edge))) await caretAt(target, next);
          if (action === 'type') await target.page.keyboard.type(text);
          else await target.page.keyboard.press(action);
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
        run: async (target) => {
          await caretAt(target, next);
          await target.page.keyboard.press(end);
          if (action === 'type') await target.page.keyboard.type(text);
          else await target.page.keyboard.press(action);
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
        run: async (target) => {
          const at = await caretAt(target, next);
          if (at === null) return;
          const all = await target.ranges();
          const block = all.find(([from, to]) => at >= from && at <= to);
          const to = Math.min(block?.[1] ?? at, at + length);
          await target.select(at, to);
          await target.page.keyboard.press(key);
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
        run: async (target) => {
          for (let index = 0; index < count; index += 1)
            await target.page.keyboard.press('Control+z');
          for (let index = 0; index < redo; index += 1)
            await target.page.keyboard.press('Control+Shift+z');
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
        run: async (target) => {
          await caretAt(target, next);
          await target.page.evaluate(
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
        run: async (target) => {
          await caretAt(target, next);
          for (let index = 1; index <= word.length; index += 1) {
            const text = word.slice(0, index);
            await target.cdp.send('Input.imeSetComposition', {
              text,
              selectionStart: text.length,
              selectionEnd: text.length,
            });
          }
          if (commit) await target.cdp.send('Input.insertText', { text: word });
          else
            await target.cdp.send('Input.imeSetComposition', {
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
        run: async (target) => {
          const all = await target.ranges();
          if (all.length === 0) return;
          const [from, to] = pick(next, all);
          const at = between(next, from, to);
          await target.other(
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
        run: async (target) => {
          await target.zoom(zoom);
        },
      };
    },
  ],
];

/** A step drawn from the steps by their weights. */
export function drawStep(next: Next, steps = STEPS): Step {
  const total = steps.reduce((sum, [weight]) => sum + weight, 0);
  let at = next() * total;
  for (const [weight, make] of steps) {
    at -= weight;
    if (at < 0) return make(next);
  }
  return (steps[0] as (typeof steps)[number])[1](next);
}
