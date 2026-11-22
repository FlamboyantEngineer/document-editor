import type { Page } from '@playwright/test';
import type { DocumentFile } from '../src/model/index.js';

// The paragraphs of the script closeness checks (DOCE-LABS-7.3): seeded words of one writing system
// or character class each, every character drawn by a face the lab serves under `?scripts`
// (test/fixtures/fonts/), so the browser draws nothing from a system font.

export interface ScriptKind {
  readonly words: readonly string[];
  /** What goes between words: a space, or nothing for scripts written without spaces. */
  readonly gap: string;
}

export const scriptKinds: Record<string, ScriptKind> = {
  emoji: {
    words: [
      '😀',
      '👍🏽',
      '👩‍👩‍👧',
      '🧑‍🚀',
      '🇨🇦',
      '❤️',
      '☀️',
      '1️⃣',
      '🏳️‍🌈',
      '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      '✨',
      '🌦️',
      '🫠',
      'word',
      'smile',
      'café',
    ],
    gap: ' ',
  },
  'emoji without spaces': { words: ['😀', '👍🏽', '👩‍👩‍👧', '🇨🇦', '❤️', '🎉', 'a', 'go'], gap: '' },
  'presentation selectors': {
    words: ['☺', '☺️', '#️⃣', '✔', '✔️', '⚠', '⚠️', '↔️', '©', '©️', '⌚', '⌚️', '⌚︎', 'text'],
    gap: ' ',
  },
  cjk: {
    words: [
      '中文排版',
      '测试',
      '。',
      '，',
      '「引用」',
      '日本語',
      'かな',
      'カタカナ',
      '（括号）',
      '、',
      'ABC',
      '123',
      '天气预报每天早上',
    ],
    gap: '',
  },
  arabic: {
    words: ['مرحبا', 'بالعالم', 'السلام', 'عليكم', 'كتاب', 'العربية', '١٢٣', '2026', 'word', 'لا'],
    gap: ' ',
  },
  hebrew: {
    words: ['שלום', 'עולם', 'עִבְרִית', 'ספר', 'מילה', 'תודה', 'word', '123', '(שלום)', 'ספר,'],
    gap: ' ',
  },
  'mixed directions': {
    words: ['hello', 'שלום', 'مرحبا', '(test)', '123', 'עולם', 'العالم', 'end.'],
    gap: ' ',
  },
  devanagari: {
    words: ['नमस्ते', 'हिन्दी', 'भाषा', 'क्षत्रिय', 'श्री', 'प्रत्येक', 'दुनिया', 'word'],
    gap: ' ',
  },
  thai: { words: ['สวัสดี', 'ภาษาไทย', 'โลก', 'การทดสอบ', 'ข้อความ', 'ยาว'], gap: '' },
  'combining marks': { words: ['été', 'ño', 'ǟ', 'café', 'Å', 'ộ', 'word'], gap: ' ' },
  symbols: { words: ['→', '⇒', '∑', '∫', '≠', '♠', '♣', '✓', '⌘', '½', '€', 'word'], gap: ' ' },
};

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Seeded paragraphs of one kind: 20 to 69 words each. */
export function scriptDocument(seed: number, kind: ScriptKind, paragraphs: number): DocumentFile {
  const next = random(seed);
  const content = Array.from({ length: paragraphs }, (_, index) => {
    const count = 20 + Math.floor(next() * 50);
    const words = Array.from(
      { length: count },
      () => kind.words[Math.floor(next() * kind.words.length)] ?? 'word',
    );
    return {
      type: 'paragraph',
      attrs: { id: `s-${String(seed)}-${String(index)}` },
      content: [{ type: 'text', text: words.join(kind.gap) }],
    };
  });
  return { formatVersion: 1, sections: [{ name: null, content }] } as unknown as DocumentFile;
}

// What Pretext measures besides the text, to read a CJK font's punctuation trimming and kana
// kerning (the fork's han-kerning.ts and KANA_PROBE): a subset without them answers the probes
// with .notdef.
const PROBES =
  '中、。，．：；“‘”’\u30D7\u30C0\u30B0\u30BF\u30CE\u30E0\u30D6\u30A4\u30E1\u3048\u305A\u307A';

/** Every character the kinds use, for the subset fonts (test/fixtures/fonts/README.md). */
export const scriptCharacters = () =>
  [
    ...new Set(
      Object.values(scriptKinds)
        .flatMap(({ words }) => [...words.join('')])
        .concat([...PROBES]),
    ),
  ].join('');

export const scriptSeeds = [3, 5];
export const scriptParagraphs = 30;
export const scriptWidths = [301, 389.671875, 455, 547.984375];

/** How many paragraphs of a kind, over every seed and width, Pretext lays out on other lines than
 * Chromium, on a Pretext lab page that is already open. */
export async function countScriptDifferences(page: Page, kind: ScriptKind) {
  const counts = { blocks: 0, starts: 0, lines: 0, overflow: 0 };
  for (const seed of scriptSeeds) {
    const file = scriptDocument(seed, kind, scriptParagraphs);
    for (const width of scriptWidths) {
      const result = await page.evaluate(
        ({ file, width }) =>
          window.pretextPagination.verify('examples', width, file).then((r) => ({
            blocks: r.comparedBlocks,
            starts: r.differences.filter((d) => d.metric === 'line offsets').length,
            lines: r.differences.filter((d) => d.metric === 'line count').length,
            overflow: r.overflow.length,
          })),
        { file, width },
      );
      counts.blocks += result.blocks;
      counts.starts += result.starts;
      counts.lines += result.lines;
      counts.overflow += result.overflow;
    }
  }
  return counts;
}
