import { type Fragment, Mark } from 'prosemirror-model';
import { StepMap } from 'prosemirror-transform';
import { commonSubsequence } from '../engine/common-subsequence.js';

interface InlineText {
  readonly keys: string[];
  readonly offsets: number[];
}

// Compare Unicode characters without their marks. Inline nodes count by their actual size.
function inlineText(fragment: Fragment): InlineText {
  const keys: string[] = [];
  const offsets = [0];
  let at = 0;
  const include = (key: string, size: number) => {
    keys.push(key);
    at += size;
    offsets.push(at);
  };
  fragment.forEach((node) => {
    if (node.isText) {
      for (const char of node.text ?? '') include(char, char.length);
    } else {
      include(JSON.stringify(node.mark(Mark.none).toJSON()), node.nodeSize);
    }
  });
  return { keys, offsets };
}

interface TextPair {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

interface MatchPoint {
  readonly before: number;
  readonly after: number;
}

interface PathStart {
  readonly from: MatchPoint;
  readonly previous: MatchPath | null;
}

interface MatchPath extends PathStart {
  readonly to: MatchPoint;
}

interface MatchWork {
  left: number;
}

const maxSparseEdits = 128;

function nextEdit(
  text: TextPair,
  paths: ReadonlyMap<number, MatchPath>,
  diagonal: number,
): PathStart | null {
  const deletePath = paths.get(diagonal - 1);
  const insertPath = paths.get(diagonal + 1);
  const remove = deletePath && deletePath.to.before < text.before.length ? deletePath : null;
  const insert = insertPath && insertPath.to.after < text.after.length ? insertPath : null;
  if (insert && (!remove || remove.to.before < insert.to.before)) {
    return { from: { before: insert.to.before, after: insert.to.after + 1 }, previous: insert };
  }
  if (!remove) return null;
  return { from: { before: remove.to.before + 1, after: remove.to.after }, previous: remove };
}

function extendMatch(text: TextPair, start: PathStart, work: MatchWork): MatchPath {
  let { before, after } = start.from;
  while (
    work.left > 0 &&
    before < text.before.length &&
    after < text.after.length &&
    text.before[before] === text.after[after]
  ) {
    before += 1;
    after += 1;
    work.left -= 1;
  }
  return { ...start, to: { before, after } };
}

function isComplete({ to }: MatchPath, text: TextPair): boolean {
  return to.before === text.before.length && to.after === text.after.length;
}

// Myers' search follows the furthest match on each diagonal at a given edit distance. It finds
// a long repeated stretch between small edits without building a table of pairs of characters.
function matchFewEdits(text: TextPair): MatchPath | null {
  const work = { left: 8 * (text.before.length + text.after.length) + 100_000 };
  const first = extendMatch(text, { from: { before: 0, after: 0 }, previous: null }, work);
  if (isComplete(first, text)) return first;
  let paths = new Map([[0, first]]);
  for (let distance = 1; distance <= maxSparseEdits && work.left > 0; distance += 1) {
    const next = new Map<number, MatchPath>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const start = nextEdit(text, paths, diagonal);
      if (!start) continue;
      const path = extendMatch(text, start, work);
      if (isComplete(path, text)) return path;
      next.set(diagonal, path);
    }
    paths = next;
  }
  return null;
}

function* matchingRuns(text: TextPair): Generator<Pick<MatchPath, 'from' | 'to'>> {
  const sparse = text.before.length * text.after.length > 1_000_000 ? matchFewEdits(text) : null;
  if (sparse) {
    const runs: MatchPath[] = [];
    for (let path: MatchPath | null = sparse; path; path = path.previous) {
      if (path.from.before < path.to.before) runs.push(path);
    }
    yield* runs.reverse();
    return;
  }
  for (const [before, after] of commonSubsequence(text.before, text.after)) {
    yield { from: { before, after }, to: { before: before + 1, after: after + 1 } };
  }
}

/** Maps text-block positions through each changed span between unchanged text runs. */
export function mapRoomText(previous: Fragment, next: Fragment): StepMap {
  if (previous.eq(next)) return StepMap.empty;
  const before = inlineText(previous);
  const after = inlineText(next);
  const ranges: number[] = [];
  let oldOffset = 0;
  let newOffset = 0;
  const changedAt = (oldEnd: number, newEnd: number) => {
    const oldSize = oldEnd - oldOffset;
    const newSize = newEnd - newOffset;
    if (oldSize !== newSize) ranges.push(oldOffset, oldSize, newSize);
  };
  for (const { from, to } of matchingRuns({ before: before.keys, after: after.keys })) {
    changedAt(before.offsets[from.before] ?? previous.size, after.offsets[from.after] ?? next.size);
    oldOffset = before.offsets[to.before] ?? previous.size;
    newOffset = after.offsets[to.after] ?? next.size;
  }
  changedAt(previous.size, next.size);
  return new StepMap(ranges);
}
