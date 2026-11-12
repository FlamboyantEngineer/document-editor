import { deleteSelection, splitBlock } from 'prosemirror-commands';
import { history, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import { documentKeys } from './document-editing.js';
import {
  acceptAllSuggestions,
  acceptSuggestion,
  listSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
} from './suggestion-decisions.js';
import { suggestTransaction } from './suggestions.js';
import { markSystemChange } from './transaction-kind.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

function select(state: EditorState, from: number, to = from) {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

let ids = 0;

// Runs a command in suggest mode: its transaction rewritten as a suggestion by `writer`.
function suggest(state: EditorState, command: Command, author = 'writer'): EditorState | null {
  let next: EditorState | null = state;
  command(state, (tr) => {
    const rewritten = suggestTransaction(tr, state, {
      author,
      newId: () => (ids += 1).toString(16).padStart(8, '0'),
    });
    next = rewritten ? state.apply(rewritten) : null;
  });
  return next;
}

const typing =
  (text: string): Command =>
  (state, dispatch) => {
    dispatch?.(state.tr.insertText(text));
    return true;
  };

const backspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return deleteSelection(state, dispatch);
  dispatch?.(state.tr.delete($from.pos - 1, $from.pos));
  return true;
};

// Each block's text with suggested insertions as [+text] and deletions as [-text].
function markup(doc: Node): string[] {
  const blocks: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach((child) => {
      const marks = child.marks.map((mark) => mark.type.name);
      const value = child.text ?? '';
      if (marks.includes('deletion')) text += `[-${value}]`;
      else if (marks.includes('insertion')) text += `[+${value}]`;
      else text += value;
    });
    const kind = node.attrs.suggestionSplitKind as string | null;
    blocks.push(kind ? `${kind}:${text}` : text);
    return false;
  });
  return blocks;
}

function decide(state: EditorState | null, command: Command): EditorState | null {
  if (!state) return null;
  let next: EditorState | null = null;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

describe('suggest mode', () => {
  it('DOCE-SUGGESTIONS-1.1 keeps typed text as a suggested insertion by the writer', () => {
    const doc = read(paragraph('Alpha blue'));
    const state = select(EditorState.create({ doc }), positionOf(doc, ' blue'));
    let next = suggest(state, typing('X'));
    next = next && suggest(next, typing('Y'));
    expect(next && markup(next.doc)).toEqual(['Alpha[+XY] blue']);
    expect(next && listSuggestions(next.doc)).toEqual([
      expect.objectContaining({ author: 'writer', inserted: 'XY', deleted: '' }),
    ]);
    expect(next?.selection.from).toBe(positionOf(doc, ' blue') + 2);
  });

  it('DOCE-SUGGESTIONS-1.2 keeps deleted text in place as a suggested deletion', () => {
    const doc = read(paragraph('Alpha blue'));
    const at = positionOf(doc, ' blue');
    const back = suggest(select(EditorState.create({ doc }), at), backspace);
    const twice = back && suggest(back, backspace);
    expect(twice && markup(twice.doc)).toEqual(['Alp[-ha] blue']);
    expect(twice?.selection.from).toBe(at - 2);
    expect(twice && listSuggestions(twice.doc)).toHaveLength(1);
    const replaced = suggest(select(EditorState.create({ doc }), at + 1, at + 5), typing('gamma'));
    expect(replaced && markup(replaced.doc)).toEqual(['Alpha [-blue][+gamma]']);
    expect(replaced && listSuggestions(replaced.doc)).toEqual([
      expect.objectContaining({ inserted: 'gamma', deleted: 'blue' }),
    ]);
  });

  it('DOCE-SUGGESTIONS-1.3 removes a writer’s own suggested text outright', () => {
    const doc = read(paragraph('Alpha'));
    const typed = suggest(
      select(EditorState.create({ doc }), positionOf(doc, 'Alpha') + 5),
      typing('XY'),
    );
    const back = typed && suggest(typed, backspace);
    expect(back && markup(back.doc)).toEqual(['Alpha[+X]']);
    const other = typed && suggest(typed, backspace, 'reviewer');
    expect(other && markup(other.doc)).toEqual(['Alpha[+X][-Y]']);
  });

  it('DOCE-SUGGESTIONS-1.4 suggests a split block as its halves, and an empty block at its ends', () => {
    const doc = read(paragraph('Alpha blue'));
    const middle = suggest(
      select(EditorState.create({ doc }), positionOf(doc, ' blue')),
      splitBlock,
    );
    expect(middle && markup(middle.doc)).toEqual([
      'deletion:[-Alpha blue]',
      'insertion:[+Alpha]',
      'insertion:[+ blue]',
    ]);
    expect(middle?.selection.$from.parent.textContent).toBe(' blue');
    expect(middle && listSuggestions(middle.doc)).toEqual([
      expect.objectContaining({ author: 'writer', deleted: 'Alpha blue', inserted: 'Alpha blue' }),
    ]);
    const level = read({ ...paragraph('Alpha blue'), attrs: { level: 2 } });
    const enter = suggest(
      select(EditorState.create({ doc: level }), positionOf(level, ' blue')),
      documentKeys(documentSchema).Enter as Command,
    );
    expect(enter && markup(enter.doc)).toEqual([
      'deletion:[-Alpha blue]',
      'insertion:[+Alpha]',
      'insertion:[+ blue]',
    ]);
    expect(enter?.selection.$from.parent.attrs.paragraphLevel).toBe(2);
    const end = suggest(
      select(EditorState.create({ doc }), positionOf(doc, 'blue') + 4),
      splitBlock,
    );
    expect(end && markup(end.doc)).toEqual(['Alpha blue', 'insertion:']);
  });

  it('DOCE-SUGGESTIONS-1.5 leaves other changes as they are and refuses what it cannot record', () => {
    const doc = read(paragraph('Alpha'));
    const state = EditorState.create({ doc });
    const tr = state.tr.insertText('X', 1).setMeta('addToHistory', false);
    expect(suggestTransaction(tr, state)).toBe(tr);
    const selection = state.tr.setSelection(TextSelection.create(doc, 3));
    expect(suggestTransaction(selection, state)).toBe(selection);
    const list = read({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph('One')] }],
    });
    const inList = EditorState.create({ doc: list });
    const pos = positionOf(list, 'One') + 1;
    const split = inList.tr.split(pos, 2);
    expect(suggestTransaction(split, inList)).toBeNull();
  });

  it('DOCE-SUGGESTIONS-1.5 leaves a system change as it is', () => {
    const state = EditorState.create({ doc: read(paragraph('Alpha')) });
    const tr = markSystemChange(state.tr.insertText('X', 1));
    expect(suggestTransaction(tr, state, { author: 'writer' })).toBe(tr);
  });

  it('DOCE-SUGGESTIONS-1.5 undoes a suggestion rather than suggesting its undoing', () => {
    const doc = read(paragraph('Alpha'));
    const end = positionOf(doc, 'Alpha') + 5;
    const start = select(EditorState.create({ doc, plugins: [history()] }), end);
    const typed = suggest(start, typing('!'));
    expect(typed && markup(typed.doc)).toEqual(['Alpha[+!]']);
    const undone = typed && suggest(typed, undo);
    expect(undone && markup(undone.doc)).toEqual(['Alpha']);
  });
});

describe('deciding suggestions', () => {
  const suggested = () => {
    const doc = read(paragraph('Alpha blue'), paragraph('Gamma'));
    const at = positionOf(doc, 'blue');
    let state = suggest(select(EditorState.create({ doc }), at, at + 4), typing('delta'));
    const gamma = state ? positionOf(state.doc, 'Gamma') + 5 : 0;
    state = state && suggest(select(state, gamma), typing('!'), 'reviewer');
    return state;
  };

  it('DOCE-SUGGESTIONS-2.1 accepts and rejects one suggestion', () => {
    const state = suggested();
    const [first] = state ? listSuggestions(state.doc) : [];
    const accepted = decide(state, acceptSuggestion(first?.id ?? ''));
    expect(accepted && markup(accepted.doc)).toEqual(['Alpha delta', 'Gamma[+!]']);
    const rejected = decide(state, rejectSuggestion(first?.id ?? ''));
    expect(rejected && markup(rejected.doc)).toEqual(['Alpha blue', 'Gamma[+!]']);
  });

  it('DOCE-SUGGESTIONS-2.2 accepts and rejects every suggestion, blocks included', () => {
    const state = suggested();
    expect(decide(state, acceptAllSuggestions)?.doc.textContent).toBe('Alpha deltaGamma!');
    expect(decide(state, rejectAllSuggestions)?.doc.textContent).toBe('Alpha blueGamma');
    const doc = read(paragraph('Alpha blue'));
    const split = suggest(
      select(EditorState.create({ doc }), positionOf(doc, ' blue')),
      splitBlock,
    );
    const kept = decide(split, acceptAllSuggestions);
    expect(kept && markup(kept.doc)).toEqual(['Alpha', ' blue']);
    const undone = decide(split, rejectAllSuggestions);
    expect(undone && markup(undone.doc)).toEqual(['Alpha blue']);
  });

  it('DOCE-SUGGESTIONS-2.3 stores suggestions with their id and author', () => {
    ids = 0;
    const state = suggested();
    const file = state ? writeDocumentFile(state.doc) : null;
    const [first] = file?.sections[0]?.content ?? [];
    expect(first?.content?.find((child) => child.text === 'delta')?.marks).toEqual([
      { type: 'insertion', attrs: { id: '00000001', author: 'writer' } },
    ]);
    const again = file ? readDocumentFile(file, documentSchema).doc : null;
    expect(again && state?.doc.eq(again)).toBe(true);
  });
});
