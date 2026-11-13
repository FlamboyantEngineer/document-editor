import { setBlockType, toggleMark } from 'prosemirror-commands';
import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../test/document-markup.js';
import {
  createDocumentSchema,
  type IdentityAttribute,
  readDocumentFile,
  type StoredNode,
  writeDocumentFile,
} from '../model/index.js';
import { setTextblockType } from './block-type.js';
import {
  decideSuggestions,
  listSuggestions,
  rejectAllSuggestions,
} from './suggestion-decisions.js';
import { suggestTransaction } from './suggestions.js';
import { markSystemChange } from './transaction-kind.js';

const { strong } = documentSchema.marks;
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;
const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

function selectText(state: EditorState, value: string): EditorState {
  const from = positionOf(state.doc, value);
  const selection = TextSelection.create(state.doc, from, from + value.length);
  return state.apply(state.tr.setSelection(selection));
}

let ids = 0;
function suggest(state: EditorState, command: Command, author = 'writer'): EditorState {
  let next = state;
  command(state, (tr) => {
    const out = suggestTransaction(tr, state, { author, newId: () => `s${(ids += 1)}` });
    if (!out) throw new Error('refused');
    next = state.apply(out);
  });
  return next;
}

function apply(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

// Each text run with its marks' names, the format change's own as `format`.
function runs(doc: Node): string[] {
  const out: string[] = [];
  doc.descendants((node) => {
    if (!node.isText) return true;
    const names = node.marks.map((mark) =>
      mark.type.name === 'format_change' ? 'format' : mark.type.name,
    );
    out.push(names.length ? `${node.text}<${names.join(',')}>` : (node.text ?? ''));
    return false;
  });
  return out;
}

const decided = (state: EditorState, decision: 'accept' | 'reject') => {
  const tr = state.tr;
  decideSuggestions(tr, decision);
  return tr.doc;
};

describe('tracked formatting', () => {
  const start = () => EditorState.create({ doc: read(paragraph('Alpha blue gamma')) });

  it('DOCE-SUGGESTIONS-4.1 suggests bolding text, accepted or rejected like text', () => {
    const bold = suggest(selectText(start(), 'blue'), toggleMark(strong as never));
    expect(runs(bold.doc)).toEqual(['Alpha ', 'blue<strong,format>', ' gamma']);
    expect(listSuggestions(bold.doc)).toEqual([
      expect.objectContaining({ author: 'writer', formatted: true, inserted: '', deleted: '' }),
    ]);
    expect(runs(decided(bold, 'accept'))).toEqual(['Alpha ', 'blue<strong>', ' gamma']);
    expect(runs(decided(bold, 'reject'))).toEqual(['Alpha blue gamma']);
  });

  it('DOCE-SUGGESTIONS-4.1 drops the suggestion when the formatting is changed back', () => {
    const bold = suggest(selectText(start(), 'blue'), toggleMark(strong as never));
    const back = suggest(selectText(bold, 'blue'), toggleMark(strong as never));
    expect(runs(back.doc)).toEqual(['Alpha blue gamma']);
    expect(listSuggestions(back.doc)).toEqual([]);
  });

  it('DOCE-SUGGESTIONS-4.1 restores what was there when unbolding is rejected', () => {
    const doc = read({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }],
    });
    const plain = suggest(
      selectText(EditorState.create({ doc }), 'Bold'),
      toggleMark(strong as never),
    );
    expect(runs(plain.doc)).toEqual(['Bold<format>']);
    expect(runs(apply(plain, rejectAllSuggestions).doc)).toEqual(['Bold<strong>']);
  });

  it('DOCE-SUGGESTIONS-4.2 suggests a block type change, restored when rejected', () => {
    const heading = documentSchema.nodes.heading;
    const changed = suggest(
      selectText(start(), 'blue'),
      setBlockType(heading as never, { level: 2 }),
    );
    const block = (doc: Node) => doc.nodeAt(positionOf(doc, 'Alpha') - 1);
    expect(block(changed.doc)?.type.name).toBe('heading');
    expect(block(changed.doc)?.attrs.suggestionFormat).toEqual(
      expect.objectContaining({ author: 'writer', type: 'paragraph' }),
    );
    expect(listSuggestions(changed.doc)).toEqual([expect.objectContaining({ formatted: true })]);
    const accepted = decided(changed, 'accept');
    expect(block(accepted)?.type.name).toBe('heading');
    expect(block(accepted)?.attrs.suggestionFormat).toBeNull();
    const rejected = decided(changed, 'reject');
    expect(block(rejected)?.type.name).toBe('paragraph');
    expect(block(rejected)?.attrs.suggestionFormat).toBeNull();
  });

  it('DOCE-SUGGESTIONS-4.4 stores format changes by their stored names and reads them back', () => {
    const heading = documentSchema.nodes.heading;
    const bold = suggest(selectText(start(), 'blue'), toggleMark(strong as never));
    const changed = suggest(
      selectText(bold, 'Alpha'),
      setBlockType(heading as never, { level: 2 }),
    );
    const file = writeDocumentFile(changed.doc);
    const [stored] = file.sections[0]?.content ?? [];
    expect(stored?.attrs?.suggestionFormat).toEqual(
      expect.objectContaining({ type: 'paragraph', attrs: {} }),
    );
    expect(readDocumentFile(file, documentSchema).doc.eq(changed.doc)).toBe(true);
  });

  it('DOCE-SUGGESTIONS-4.2 suggests an attribute change, restored when rejected', () => {
    const state = start();
    const pos = positionOf(state.doc, 'Alpha') - 1;
    const level: Command = (current, dispatch) => {
      dispatch?.(current.tr.setNodeAttribute(pos, 'paragraphLevel', 3));
      return true;
    };
    const changed = suggest(state, level);
    expect(changed.doc.nodeAt(pos)?.attrs.paragraphLevel).toBe(3);
    expect(decided(changed, 'reject').nodeAt(pos)?.attrs.paragraphLevel).toBe(1);
  });

  it('DOCE-SUGGESTIONS-4.2 DOCE-SUGGESTIONS-1.5 refuses a formatting change on a block that cannot be suggested', () => {
    const code = EditorState.create({
      doc: read({ type: 'codeBlock', content: [{ type: 'text', text: 'let one = 1' }] }),
    });
    const pos = positionOf(code.doc, 'let one') - 1;
    const refused = (step: (state: EditorState) => Transaction) =>
      suggestTransaction(step(code), code, { author: 'writer' });
    expect(refused((state) => state.tr.setNodeAttribute(pos, 'language', 'typescript'))).toBeNull();
    expect(
      refused((state) => state.tr.setNodeMarkup(pos, null, { language: 'typescript' })),
    ).toBeNull();
    const identity = refused((state) => state.tr.setNodeAttribute(pos, 'dataId', 'c0de0001'));
    expect(identity?.doc.nodeAt(pos)?.attrs.dataId).toBe('c0de0001');
  });

  it('DOCE-SUGGESTIONS-4.2 keeps a host’s identity attribute out of the record, so rejecting leaves it as set since', () => {
    const reviewState: IdentityAttribute = {
      name: 'reviewState',
      dom: 'data-review-state',
      scope: ['paragraph', 'heading'],
      onCopy: 'clear',
    };
    const schema = createDocumentSchema({ schema: { identityAttributes: [reviewState] } });
    const doc = parseMarkup('<p data-id="aaaa0001" data-review-state="draft">Alpha</p>', schema);
    const heading = schema.nodes.heading;
    if (!heading) throw new Error('No heading');
    const pos = positionOf(doc, 'Alpha') - 1;
    const changed = suggest(
      selectText(EditorState.create({ doc }), 'Alpha'),
      setTextblockType(heading, { level: 2 }),
    );
    expect(changed.doc.nodeAt(pos)?.attrs.suggestionFormat).toEqual(
      expect.objectContaining({ type: 'paragraph', attrs: {} }),
    );
    // The host moves the element on, outside the history.
    const reviewed = changed.apply(
      changed.tr.setNodeAttribute(pos, 'reviewState', 'review').setMeta('addToHistory', false),
    );
    const rejected = decided(reviewed, 'reject').nodeAt(pos);
    expect(rejected?.type.name).toBe('paragraph');
    expect(rejected?.attrs.reviewState).toBe('review');
  });

  it('DOCE-SUGGESTIONS-4.3 leaves formatting of the writer’s own insertion and system changes alone', () => {
    const initial = start();
    const end = positionOf(initial.doc, 'gamma') + 5;
    const typed = suggest(
      initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, end))),
      (state, dispatch) => {
        dispatch?.(state.tr.insertText('!'));
        return true;
      },
    );
    const own = suggest(selectText(typed, '!'), toggleMark(strong as never));
    expect(runs(own.doc)).toEqual(['Alpha blue gamma', '!<strong,insertion>']);
    const state = selectText(start(), 'blue');
    const system = markSystemChange(
      state.tr.addMark(state.selection.from, state.selection.to, documentSchema.mark('strong')),
    );
    expect(suggestTransaction(system, state, { author: 'writer' })).toBe(system);
  });

  it('DOCE-SUGGESTIONS-4.3 reports a format change inside a rejected insertion as decided', () => {
    const initial = start();
    const end = positionOf(initial.doc, 'gamma') + 5;
    const typed = suggest(
      initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, end))),
      (state, dispatch) => {
        dispatch?.(state.tr.insertText(' delta'));
        return true;
      },
    );
    const bolded = suggest(selectText(typed, 'delta'), toggleMark(strong as never), 'reviewer');
    const [insertion, format] = listSuggestions(bolded.doc);
    expect(format).toEqual(expect.objectContaining({ author: 'reviewer', formatted: true }));
    const tr = bolded.tr;
    const report = decideSuggestions(tr, 'reject', { ids: new Set([insertion?.id ?? '']) });
    expect(report?.dependents).toEqual([
      { suggestion: expect.objectContaining({ id: format?.id }), dependsOn: insertion?.id },
    ]);
  });
});
