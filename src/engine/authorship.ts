// Authorship: who wrote what. A run of text is its contributor's (an agent's text carries the
// contributor mark), else its suggested insertion's writer's, else the writer of the block it is
// in. Shown, each writer's text carries a colour slot no other writer has (`data-author-slot`), the
// slots given as collaborators' are, so a reader tells the writers apart.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { placePeers } from './presence.js';

/** A writer of the document and how much of its text they wrote. */
export interface DocumentAuthor {
  readonly id: string;
  /** The characters of the text they wrote. */
  readonly characters: number;
  readonly slot: number;
}

const named = (value: unknown) => (typeof value === 'string' && value ? value : null);

// Who wrote a text node: its contributor, its suggested insertion's writer, or its block's writer.
function writerOf(node: ProseMirrorNode, block: string | null): string | null {
  const mark = (name: string) => node.marks.find((each) => each.type.name === name);
  return (
    named(mark('contributor')?.attrs.dataAuthor) ??
    named(mark('insertion')?.attrs.dataAuthor) ??
    block
  );
}

// Each run of text a writer wrote, with its range and writer.
function authoredRuns(doc: ProseMirrorNode) {
  const runs: { from: number; to: number; author: string }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const block = named(node.attrs.dataAuthor);
    node.forEach((child, offset) => {
      const author = child.isText ? writerOf(child, block) : null;
      if (!author) return;
      const from = pos + 1 + offset;
      runs.push({ from, to: from + child.nodeSize, author });
    });
    return false;
  });
  return runs;
}

/** The document's writers, the most text first, each with their colour slot. */
export function documentAuthors(doc: ProseMirrorNode): DocumentAuthor[] {
  const counts = new Map<string, number>();
  for (const run of authoredRuns(doc)) {
    counts.set(run.author, (counts.get(run.author) ?? 0) + run.to - run.from);
  }
  return placePeers([...counts.keys()].map((id) => ({ id, name: id })))
    .map((peer) => ({ id: peer.id, characters: counts.get(peer.id) ?? 0, slot: peer.slot }))
    .sort((a, b) => b.characters - a.characters || a.id.localeCompare(b.id));
}

interface AuthorshipState {
  readonly shown: boolean;
  readonly decorations: DecorationSet;
}

const authorshipKey = new PluginKey<AuthorshipState>('authorship');

function decorate(doc: ProseMirrorNode, shown: boolean): DecorationSet {
  if (!shown) return DecorationSet.empty;
  const slots = new Map(documentAuthors(doc).map((author) => [author.id, author.slot]));
  return DecorationSet.create(
    doc,
    authoredRuns(doc).map((run) =>
      Decoration.inline(run.from, run.to, {
        'data-author': run.author,
        'data-author-slot': String(slots.get(run.author) ?? 0),
      }),
    ),
  );
}

/** Whether authorship shows. */
export const isAuthorshipShown = (state: EditorState): boolean =>
  authorshipKey.getState(state)?.shown ?? false;

/** Shows who wrote what, or hides it. */
export function showAuthorship(shown: boolean): Command {
  return (state, dispatch) => {
    if (!authorshipKey.getState(state) || isAuthorshipShown(state) === shown) return false;
    dispatch?.(state.tr.setMeta(authorshipKey, shown).setMeta('addToHistory', false));
    return true;
  };
}

/** Marks each writer's text with their colour slot while authorship shows. */
export function createAuthorship(): Plugin<AuthorshipState> {
  return new Plugin<AuthorshipState>({
    key: authorshipKey,
    state: {
      init: () => ({ shown: false, decorations: DecorationSet.empty }),
      apply(tr, value) {
        const shown = (tr.getMeta(authorshipKey) as boolean | undefined) ?? value.shown;
        if (shown === value.shown && !(shown && tr.docChanged)) return value;
        return { shown, decorations: decorate(tr.doc, shown) };
      },
    },
    props: { decorations: (state) => authorshipKey.getState(state)?.decorations ?? null },
  });
}
