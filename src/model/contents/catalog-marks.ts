// Catalog entries from complete runs of a listed mark, including across fragments of a textblock.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { splitPartOf } from '../pagination/split-part.js';
import { type CatalogEntry, type ContentsKind, entryParts } from './contents-kinds.js';

interface ReadPlace {
  readonly pos: number;
  readonly page: number;
  readonly marker: number | null;
}

interface Run {
  readonly mark: Mark;
  readonly node: ProseMirrorNode;
  readonly place: ReadPlace;
  text: string;
}

type Kind = readonly [key: string, kind: ContentsKind];

interface Continuation {
  readonly part: number;
  readonly run: Run;
}

function fragmentKey(block: ProseMirrorNode, doc: ProseMirrorNode, pos: number): string {
  const id: unknown = block.attrs.dataId;
  if (typeof id === 'string' && id) return `id:${id}`;
  // A fresh stored document may have no element ids yet. Each column continues independently.
  const $pos = doc.resolve(pos);
  const path = [$pos.index(0)];
  for (let depth = 1; depth < $pos.depth; depth += 1) {
    if ($pos.node(depth).type.name === 'layout_column') path.push($pos.index(depth - 1));
  }
  return `${block.type.name}:${path.join('.')}`;
}

function markEntry([key, kind]: Kind, run: Run): CatalogEntry | null {
  const { node, mark, text, place } = run;
  if (kind.include?.(node, mark) === false) return null;
  return {
    kind: key,
    level: kind.level?.(node, mark) ?? 0,
    number: kind.number?.(node, mark) ?? '',
    text: kind.text?.(node, mark, text) ?? text,
    pos: place.pos,
    page: place.page,
    ...entryParts(kind, node, run),
  };
}

function readRuns(
  block: ProseMirrorNode,
  { place, marks }: { readonly place: ReadPlace; readonly marks: readonly string[] },
  { runs, previous }: { readonly runs: Run[]; readonly previous: Run | undefined },
): Run | null {
  let open: Run | null = previous ?? null;
  block.forEach((node, offset) => {
    const mark = node.marks.find((candidate) => marks.includes(candidate.type.name));
    if (!mark) {
      open = null;
      return;
    }
    if (open?.mark.eq(mark)) {
      open.text += node.textContent;
      return;
    }
    open = { node, mark, text: node.textContent, place: { ...place, pos: place.pos + offset } };
    runs.push(open);
  });
  return open;
}

/** Accumulates listed mark runs before their texts, identities and order are read. */
export function catalogMarks(doc: ProseMirrorNode, kinds: readonly Kind[]) {
  const collected = kinds.flatMap((named) => {
    const marks = named[1].marks;
    return marks?.length
      ? [{ named, marks, runs: [] as Run[], continuations: new Map<string, Continuation>() }]
      : [];
  });
  if (!collected.length) return null;
  return {
    read(block: ProseMirrorNode, place: ReadPlace) {
      const part = splitPartOf(block);
      const key = part === null ? null : fragmentKey(block, doc, place.pos);
      for (const { marks, runs, continuations } of collected) {
        const previous = key === null ? undefined : continuations.get(key);
        const following = part !== null && previous?.part === part - 1;
        const run = readRuns(
          block,
          { place, marks },
          { runs, previous: following ? previous.run : undefined },
        );
        if (key === null || part === null) continue;
        if (run) continuations.set(key, { part, run });
        else continuations.delete(key);
      }
    },
    forEach(add: (entry: CatalogEntry, marker: number | null) => void) {
      for (const { named, runs } of collected) {
        for (const run of runs) {
          const entry = markEntry(named, run);
          if (entry) add(entry, run.place.marker);
        }
      }
    },
  };
}
