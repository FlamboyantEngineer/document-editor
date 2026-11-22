import type { CDPSession, Page } from '@playwright/test';
import type { CollabRoomProbe } from '../labs/src/collab-room.lab.js';
import type { DocumentFile, StoredNode } from '../src/model/index.js';
import {
  between,
  differences,
  drawStep,
  type EditTarget,
  lineMismatches,
  type Next,
  pick,
  random,
  runStep,
  type Step,
  STEPS,
  words,
} from './edit-sequences.js';
import { expect, test } from './fixtures.js';

// Edited pages equal a fresh layout in a shared room (specs/LABS.md DOCE-LABS-9.2): two writers edit
// one document through a room server, each at their own width and zoom, with `textLayout: 'pretext'`.
// The steps are the single-writer ones (DOCE-LABS-9.1), each made by one of the writers, the
// other writer's change typed in the other writer's editor, and the room's own: a writer going
// offline, editing and coming back to merge, both writers typing at once, and a service writing
// the room (`updateRoomDocument`). After each step and sync, each writer's pages equal a fresh
// layout of the document that writer holds, both writers hold the same document once both are
// online, and their pages' layouts are the same.

declare global {
  interface Window {
    collabRoom: CollabRoomProbe;
  }
}

const NAMES = ['Ada', 'Grace'] as const;
type Name = (typeof NAMES)[number];

const status = (page: Page, name: Name) => page.getByLabel(`${name}'s status`);
const pane = (page: Page, name: Name) => page.getByRole('region', { name, exact: true });

const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    await document.fonts.ready;
    window.collabRoom.drawAllLines();
    await window.collabRoom.settled();
  });

// A writer's editor, as a sequence edits it; the other writer's change is typed in theirs.
function writerTarget(page: Page, cdp: CDPSession, name: Name): EditTarget {
  const other: Name = name === 'Ada' ? 'Grace' : 'Ada';
  const select = (who: Name, from: number, to: number) =>
    page.evaluate(([n, a, b]) => window.collabRoom.select(n, a, b), [who, from, to] as const);
  return {
    page,
    cdp,
    ranges: () => page.evaluate((n) => window.collabRoom.textRanges(n), name),
    select: (from, to) => select(name, from, to),
    caretAtFragment: () => Promise.resolve(false),
    // At the same place in the other writer's document, or the nearest text before it when the
    // two differ, as while one of them is offline.
    other: async (change) => {
      const theirs = await page.evaluate((n) => window.collabRoom.textRanges(n), other);
      const place = (at: number) => {
        const inside = theirs.find(([from, to]) => at >= from && at <= to);
        if (inside) return at;
        const before = theirs.filter(([, to]) => to <= at).at(-1) ?? theirs[0];
        return before?.[1] ?? 0;
      };
      if (change.kind === 'insert') {
        const at = place(change.at);
        await select(other, at, at);
        await page.keyboard.type(change.text);
      } else {
        const from = place(change.from);
        await select(other, from, Math.max(from, place(change.to)));
        await page.keyboard.press('Backspace');
      }
    },
    zoom: () => Promise.resolve(),
  };
}

// The text blocks of a stored document, depth first.
function textBlocks(nodes: readonly StoredNode[]): StoredNode[] {
  return nodes.flatMap((node) =>
    node.type === 'paragraph' || node.type === 'heading' ? [node] : textBlocks(node.content ?? []),
  );
}

// A copy of a stored document with words added to the end of one of its text blocks.
function withWords(file: DocumentFile, next: Next, text: string): DocumentFile {
  const copy = structuredClone(file);
  const blocks = textBlocks(copy.sections.flatMap((section) => section.content));
  const block = blocks.length ? pick(next, blocks) : null;
  if (block)
    (block as { content?: StoredNode[] }).content = [
      ...(block.content ?? []),
      { type: 'text', text },
    ];
  return copy;
}

/** What a room step changes besides the document: who is online. */
interface Room {
  readonly online: Record<Name, boolean>;
}

/** A room step: made by the room, a service or both writers, not by one writer's keys. */
type RoomStep = (next: Next, room: Room) => Step;

const ROOM_STEPS: readonly [number, RoomStep][] = [
  [
    2,
    (next, room) => {
      const name = pick(next, NAMES);
      const online = room.online[name];
      return {
        label: `${name} goes ${online ? 'offline' : 'online'}`,
        run: async ({ page }) => {
          await pane(page, name)
            .getByRole('button', { name: online ? 'Go offline' : 'Go online' })
            .click();
          room.online[name] = !online;
        },
      };
    },
  ],
  [
    2,
    (next) => {
      const texts = NAMES.map(() => ` ${words(next, between(next, 2, 8))}`);
      const picks = NAMES.map(() => next());
      return {
        label: `both type at once ${JSON.stringify(texts)}`,
        run: async ({ page, cdp }) => {
          // Each writer types into their own editor, one key each in turn, without waiting.
          for (const [index, name] of NAMES.entries()) {
            const target = writerTarget(page, cdp, name);
            const all = await target.ranges();
            const [, end] = all[Math.floor((picks[index] ?? 0) * all.length)] ?? [0, 0];
            await target.select(end, end);
            await page.keyboard.type(texts[index] ?? '');
          }
        },
      };
    },
  ],
  [
    1,
    (next) => {
      const text = ` ${words(next, between(next, 2, 10))}`;
      return {
        label: `a service writes ${JSON.stringify(text)} into the room`,
        run: async ({ page }) => {
          const stored = await page.evaluate(() => window.collabRoom.stored('Ada'));
          if (!stored) return;
          const file = withWords(stored, next, text);
          expect(await page.evaluate((each) => window.collabRoom.updateRoom(each), file)).toBe(
            true,
          );
        },
      };
    },
  ],
];

// The steps a writer makes: the single-writer ones but the zoom, which the room lab sets per
// writer by its own control.
const WRITER_STEPS = STEPS.filter(([, make]) => !make(random(1)).label.startsWith('zoom'));

/** The fresh editor's layout of a stored document, opened in the lab's third editor. */
async function freshLayout(page: Page, file: DocumentFile) {
  await page.evaluate((each) => window.collabRoom.openFresh(each), file);
  await page.waitForFunction(() => window.collabRoom.freshLayout() !== null);
  await settle(page);
  return page.evaluate(() => window.collabRoom.freshLayout());
}

// Every way a writer's pages differ from a fresh layout of what they hold, or from their lines.
async function writerProblems(page: Page, name: Name): Promise<string[]> {
  const computed = await page.evaluate((n) => window.collabRoom.textLines(n), name);
  const lines = await lineMismatches(page, computed, { within: `section[aria-label="${name}"]` });
  const stored = await page.evaluate((n) => window.collabRoom.stored(n), name);
  if (!stored) return [...lines, `${name} holds no document`];
  const layout = await page.evaluate((n) => window.collabRoom.layout(n), name);
  expect(layout, `${name}'s pages laid out by the engine`).not.toBeNull();
  expect(computed.length, `${name}'s computed pages`).toBeGreaterThan(0);
  const fresh = await freshLayout(page, stored);
  return [...lines.map((each) => `${name}: ${each}`), ...differences(layout, fresh, `${name}`)];
}

// Both writers online hold the same document, and lay it out the same.
async function convergedProblems(page: Page): Promise<string[]> {
  const stored = () =>
    page.evaluate(() => [window.collabRoom.stored('Ada'), window.collabRoom.stored('Grace')]);
  await expect
    .poll(async () => {
      const [ada, grace] = await stored();
      return JSON.stringify(ada) === JSON.stringify(grace);
    })
    .toBe(true);
  await settle(page);
  const [ada, grace] = await page.evaluate(() => [
    window.collabRoom.layout('Ada'),
    window.collabRoom.layout('Grace'),
  ]);
  return differences(ada, grace, 'Ada against Grace');
}

const SEEDS = Number(process.env.EDIT_LAYOUT_SEEDS ?? 3);
const LENGTH = Number(process.env.EDIT_LAYOUT_STEPS ?? 12);
const FIRST_SEED = Number(process.env.EDIT_LAYOUT_FIRST_SEED ?? 1);

test.describe('DOCE-LABS-9.2 edited pages in a shared room equal a fresh layout', () => {
  for (const document of ['short', 'long'] as const) {
    for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed += 1) {
      test(`DOCE-LABS-9.2 ${document} document, seed ${String(seed)}`, async ({
        page,
        context,
      }) => {
        test.setTimeout(300_000);
        const query = document === 'long' ? '&document=long' : '';
        await page.goto(`collab-room.html?textLayout=pretext${query}`);
        for (const name of NAMES) await expect(status(page, name)).toHaveText(/^ready · /);
        await settle(page);
        const cdp = await context.newCDPSession(page);
        const next = random(seed * 104729 + document.length);
        const room: Room = { online: { Ada: true, Grace: true } };
        const done: string[] = [];
        for (let index = 0; index < LENGTH; index += 1) {
          const roomStep = next() < 0.25;
          const name = pick(next, NAMES);
          const step = roomStep
            ? drawStep(
                next,
                ROOM_STEPS.map(([weight, make]) => [weight, (n) => make(n, room)]),
              )
            : drawStep(next, WRITER_STEPS);
          done.push(roomStep ? step.label : `${name}: ${step.label}`);
          await runStep(step, writerTarget(page, cdp, name), done);
          await settle(page);
          const both = room.online.Ada && room.online.Grace;
          const problems = [
            ...(both ? await convergedProblems(page) : []),
            ...(await writerProblems(page, 'Ada')),
            ...(await writerProblems(page, 'Grace')),
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
