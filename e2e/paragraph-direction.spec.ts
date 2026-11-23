import type { Page } from '@playwright/test';
import { strongDirection } from '../src/layout-engine/direction.js';
import { expect, test } from './fixtures.js';

// A paragraph's direction from its first strong character (DOCE-PAGINATION-9.12), read from the
// generated Bidi_Class table, against Chromium's own `dir="auto"` for every code point of the
// planes that hold characters: the Basic and Supplementary Multilingual planes, the ideographic
// planes and the special-purpose plane. The other planes are unassigned or private use, of class
// L throughout, which a code point at each end of each stands for.

const SHARD = 0x8000;
const RANGES: readonly (readonly [number, number])[] = [
  ...Array.from({ length: 8 }, (_, index) => [index * SHARD, (index + 1) * SHARD] as const),
  [0xe0000, 0xe1000],
];
const PLANE_ENDS = Array.from({ length: 17 - 4 }, (_, index) => index + 4)
  .filter((plane) => plane !== 14)
  .flatMap((plane) => [plane * 0x10000, plane * 0x10000 + 0xfffd]);

const LETTER = { ltr: 'L', rtl: 'R' } as const;
const ours = (codePoint: number) => {
  const direction = strongDirection(codePoint);
  return direction ? LETTER[direction] : 'N';
};

// Chromium's class of each code point: left to right when it decides a paragraph that ends in a
// Hebrew letter, right to left when it decides one that ends in a Latin one, else neither.
async function chromiumClasses(page: Page, codePoints: readonly number[]): Promise<string> {
  return page.evaluate((points) => {
    const probes = points.flatMap((point) =>
      ['א', 'a'].map((last) => {
        const probe = document.createElement('div');
        probe.dir = 'auto';
        probe.textContent = String.fromCodePoint(point) + last;
        return probe;
      }),
    );
    document.body.replaceChildren(...probes);
    return points
      .map((_, index) => {
        if (probes[2 * index]?.matches(':dir(ltr)')) return 'L';
        return probes[2 * index + 1]?.matches(':dir(rtl)') ? 'R' : 'N';
      })
      .join('');
  }, codePoints);
}

function differences(codePoints: readonly number[], classes: string) {
  return codePoints.flatMap((point, index) => {
    const theirs = classes[index];
    const mine = ours(point);
    return mine === theirs ? [] : [`U+${point.toString(16).toUpperCase()} ${mine} ${theirs}`];
  });
}

test.describe('paragraph direction against Chromium', () => {
  for (const [from, to] of RANGES) {
    const name = `U+${from.toString(16).toUpperCase()} to U+${(to - 1).toString(16).toUpperCase()}`;
    test(`DOCE-PAGINATION-9.12 gives every code point from ${name} the class Chromium reads`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setContent('<!doctype html><body></body>');
      const found: string[] = [];
      for (let start = from; start < to; start += 0x1000) {
        const points = Array.from({ length: 0x1000 }, (_, index) => start + index).filter(
          (point) => point < 0xd800 || point > 0xdfff,
        );
        found.push(...differences(points, await chromiumClasses(page, points)));
      }
      expect(found).toEqual([]);
    });
  }

  test('DOCE-PAGINATION-9.12 gives the code points at the ends of the other planes the class Chromium reads', async ({
    page,
  }) => {
    await page.setContent('<!doctype html><body></body>');
    expect(differences(PLANE_ENDS, await chromiumClasses(page, PLANE_ENDS))).toEqual([]);
  });

  test('DOCE-PAGINATION-9.12 decides the paragraphs Chromium decides, isolates read through', async ({
    page,
  }) => {
    const texts = ['Ⅲ שלום', 'ـabc', '⁧abc⁩ א', '⁧אב⁩ a', '123 !?'];
    await page.setContent('<!doctype html><body></body>');
    const theirs = await page.evaluate((all) => {
      document.body.replaceChildren(
        ...all.map((text) => {
          const probe = document.createElement('p');
          probe.dir = 'auto';
          probe.textContent = text;
          return probe;
        }),
      );
      return [...document.body.children].map((probe) =>
        probe.matches(':dir(rtl)') ? 'rtl' : 'ltr',
      );
    }, texts);
    const first = (text: string) => {
      for (const character of text) {
        const direction = strongDirection(character.codePointAt(0) ?? 0);
        if (direction) return direction;
      }
      return 'ltr';
    };
    expect(texts.map(first)).toEqual(theirs);
    expect(theirs).toEqual(['ltr', 'rtl', 'ltr', 'rtl', 'ltr']);
  });
});
