// A word-level comparison of two texts: what each kept, inserted and deleted, in order. Words,
// spaces and punctuation are compared whole; a replaced word that shares its start or end with the
// word it replaces keeps those characters.

/** A run of text one side kept, the newer inserted or the older deleted. */
export interface TextSegment {
  readonly kind: 'kept' | 'inserted' | 'deleted';
  readonly text: string;
}

type Kind = TextSegment['kind'];

import { commonSubsequence } from './common-subsequence.js';

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

function tokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

// Appends a run, joining it to the last one of its kind.
function push(segments: { kind: Kind; text: string }[], kind: Kind, text: string) {
  if (!text) return;
  const last = segments.at(-1);
  if (last?.kind === kind) last.text += text;
  else segments.push({ kind, text });
}

// The characters two texts share at their start, then at their end.
function sharedEnds(a: string, b: string): [number, number] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end += 1;
  }
  return [start, end];
}

// Keeps the characters a deleted run and the inserted run after it share at their ends, when one
// holds the other whole.
function refine(segments: readonly { kind: Kind; text: string }[]): TextSegment[] {
  const refined: { kind: Kind; text: string }[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (!current) continue;
    if (current.kind !== 'deleted' || next?.kind !== 'inserted') {
      push(refined, current.kind, current.text);
      continue;
    }
    const [start, end] = sharedEnds(current.text, next.text);
    // Only a change inside a word, such as a letter added to it, keeps the word's characters.
    if (start + end < Math.min(current.text.length, next.text.length)) {
      push(refined, current.kind, current.text);
      continue;
    }
    push(refined, 'kept', current.text.slice(0, start));
    push(refined, 'deleted', current.text.slice(start, current.text.length - end));
    push(refined, 'inserted', next.text.slice(start, next.text.length - end));
    push(refined, 'kept', next.text.slice(next.text.length - end));
    index += 1;
  }
  return refined;
}

/** The runs two texts keep, insert and delete, in the newer text's order, deletions first. */
export function diffText(older: string, newer: string): TextSegment[] {
  const before = tokens(older);
  const after = tokens(newer);
  const segments: { kind: Kind; text: string }[] = [];
  let i = 0;
  let j = 0;
  const pairs: [number, number][] = [
    ...commonSubsequence(before, after),
    [before.length, after.length],
  ];
  for (const [nextI, nextJ] of pairs) {
    push(segments, 'deleted', before.slice(i, nextI).join(''));
    push(segments, 'inserted', after.slice(j, nextJ).join(''));
    push(segments, 'kept', before[nextI] ?? '');
    i = nextI + 1;
    j = nextJ + 1;
  }
  return refine(segments);
}
