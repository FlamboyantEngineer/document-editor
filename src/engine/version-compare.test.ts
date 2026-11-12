import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { diffText } from './text-diff.js';
import {
  changeLineMarks,
  createVersionChanges,
  refreshVersionChanges,
  versionChangeDecorations,
  versionChanges,
} from './version-changes.js';
import { compareVersions } from './version-compare.js';

const paragraph = (id: string, value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'paragraph',
  attrs: { id, ...attrs },
  content: value ? [{ type: 'text', text: value }] : [],
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const summary = (older: StoredNode[], newer: StoredNode[]) =>
  compareVersions(read(...older), read(...newer)).map(({ kind, id, text }) => [kind, id, text]);

describe('comparing versions', () => {
  it('DOCE-VERSIONS-1.1 finds inserted, deleted and modified blocks by element id', () => {
    const older = [
      paragraph('a0000001', 'Alpha'),
      paragraph('a0000002', 'Blue'),
      paragraph('a0000003', 'Gamma'),
    ];
    const newer = [
      paragraph('a0000001', 'Alpha'),
      paragraph('a0000004', 'New'),
      paragraph('a0000003', 'Gamma ray'),
    ];
    expect(summary(older, newer)).toEqual([
      ['insertion', 'a0000004', 'New'],
      ['deletion', 'a0000002', 'Blue'],
      ['modification', 'a0000003', 'Gamma ray'],
    ]);
    expect(summary(older, older)).toEqual([]);
  });

  it('DOCE-VERSIONS-1.2 tells a moved block and a formatting change from an edit', () => {
    const older = [
      paragraph('a0000001', 'One'),
      paragraph('a0000002', 'Two'),
      paragraph('a0000003', 'Three'),
    ];
    const newer = [
      paragraph('a0000002', 'Two'),
      paragraph('a0000003', 'Three', { level: 2 }),
      paragraph('a0000001', 'One'),
    ];
    expect(summary(older, newer)).toEqual([
      ['formatting', 'a0000003', 'Three'],
      ['move', 'a0000001', 'One'],
    ]);
  });

  it('DOCE-VERSIONS-1.3 places a deleted block before the next kept block, or after the last', () => {
    const doc = read(paragraph('a0000001', 'One'));
    const [before] = compareVersions(
      read(paragraph('a0000009', 'Gone'), paragraph('a0000001', 'One')),
      doc,
    );
    const [after] = compareVersions(
      read(paragraph('a0000001', 'One'), paragraph('a0000009', 'Gone')),
      doc,
    );
    expect(before?.at).toMatchObject({ after: false });
    expect(after?.at).toMatchObject({ after: true });
    expect(before?.at?.from).toBe(after?.at?.from);
  });

  it('DOCE-VERSIONS-1.4 leaves comments and suggestions out', () => {
    const marked: StoredNode = {
      type: 'paragraph',
      attrs: { id: 'a0000001' },
      content: [
        {
          type: 'text',
          text: 'Al',
          marks: [{ type: 'comment', attrs: { thread: 't', state: 'open' } }],
        },
        { type: 'text', text: 'pha' },
        {
          type: 'text',
          text: '!',
          marks: [{ type: 'insertion', attrs: { id: 's1', author: 'w' } }],
        },
      ],
    };
    expect(summary([paragraph('a0000001', 'Alpha')], [marked])).toEqual([]);
  });

  it('DOCE-VERSIONS-1.6 compares with the suggestions accepted when asked', () => {
    const suggested: StoredNode = {
      type: 'paragraph',
      attrs: { id: 'a0000001' },
      content: [
        {
          type: 'text',
          text: 'every',
          marks: [{ type: 'deletion', attrs: { id: 's1', author: 'w' } }],
        },
        {
          type: 'text',
          text: 'each',
          marks: [{ type: 'insertion', attrs: { id: 's1', author: 'w' } }],
        },
      ],
    };
    const older = read(paragraph('a0000001', 'every'));
    expect(compareVersions(older, read(suggested))).toEqual([]);
    const [accepted] = compareVersions(older, read(suggested), { suggestions: 'accepted' });
    expect(accepted).toMatchObject({ kind: 'modification', text: 'each', previousText: 'every' });
  });

  it('DOCE-VERSIONS-1.5 compares a changed block word by word', () => {
    expect(diffText('The log keeps every report.', 'The log keeps each report!')).toEqual([
      { kind: 'kept', text: 'The log keeps ' },
      { kind: 'deleted', text: 'every' },
      { kind: 'inserted', text: 'each' },
      { kind: 'kept', text: ' report' },
      { kind: 'deleted', text: '.' },
      { kind: 'inserted', text: '!' },
    ]);
    expect(diffText('continuity', 'Qcontinuity')).toEqual([
      { kind: 'inserted', text: 'Q' },
      { kind: 'kept', text: 'continuity' },
    ]);
    const [change] = compareVersions(
      read(paragraph('a0000001', 'Alpha blue')),
      read(paragraph('a0000001', 'Alpha gamma')),
    );
    expect(change?.segments).toEqual([
      { kind: 'kept', text: 'Alpha ' },
      { kind: 'deleted', text: 'blue' },
      { kind: 'inserted', text: 'gamma' },
    ]);
  });
});

describe('showing version changes', () => {
  const older = read(paragraph('a0000001', 'Alpha blue'), paragraph('a0000002', 'Gone'));
  const newer = read(paragraph('a0000001', 'Alpha gamma'), paragraph('a0000003', 'Added'));

  it('DOCE-VERSIONS-2.1 marks changed blocks and lines, and in markup the words and blocks they lost', () => {
    const changes = compareVersions(older, newer);
    const markup = versionChangeDecorations(newer, changes, 'markup').find();
    // A node or inline decoration's attributes (ProseMirror keeps them on its type).
    const attrsOf = (decorations: typeof markup) =>
      decorations.map(
        (decoration) => (decoration as unknown as { type: { attrs?: object } }).type.attrs,
      );
    expect(attrsOf(markup)).toEqual(
      expect.arrayContaining([
        { 'data-diff-change': 'modification', 'data-diff-lines': 'kept' },
        { 'data-diff-change': 'insertion', 'data-diff-line': 'modification' },
        { 'data-diff-change': 'insertion' },
        { 'data-diff-deletion': 'after' },
      ]),
    );
    // In bars, the replaced word is marked for its line's bar, and no deleted text shows.
    const bars = versionChangeDecorations(newer, changes, 'bars').find();
    expect(attrsOf(bars)).toContainEqual({ 'data-diff-line': 'modification' });
    expect(bars).toHaveLength(4);
    expect(markup.length).toBeGreaterThan(bars.length);
  });

  it('DOCE-VERSIONS-2.1 marks a changed line by its kind: inserted, deleted or replaced text', () => {
    const marks = (before: string, after: string) => {
      const [change] = compareVersions(
        read(paragraph('a0000001', before)),
        read(paragraph('a0000001', after)),
      );
      // Positions from the paragraph's start.
      const start = (change?.parts[0]?.from ?? 0) + 1;
      return change
        ? changeLineMarks(change).map(({ kind, from, to }) => [kind, from - start, to - start])
        : [];
    };
    expect(marks('Alpha', 'Alpha beta')).toEqual([['insertion', 5, 10]]);
    expect(marks('Alpha beta', 'Alpha')).toEqual([['deletion', 5, 5]]);
    expect(marks('Alpha blue', 'Alpha gamma')).toEqual([['modification', 6, 11]]);
  });

  it('DOCE-VERSIONS-2.2 compares the document after each change, with the older version it reads', () => {
    let previous: typeof older | null = null;
    const plugin = createVersionChanges({ previous: () => previous });
    let state = EditorState.create({ doc: newer, plugins: [plugin] });
    expect(versionChanges(state)).toEqual([]);
    previous = older;
    state = state.apply(refreshVersionChanges(state.tr));
    expect(versionChanges(state).map((change) => change.kind)).toEqual([
      'modification',
      'insertion',
      'deletion',
    ]);
    state = state.apply(state.tr.insertText('!', state.doc.content.size - 4));
    expect(versionChanges(state)).toHaveLength(3);
  });
});
