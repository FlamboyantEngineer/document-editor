import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  assignStoredIds,
  readDocumentFile,
  type StoredNode,
  templatePreviewDocument,
  templatePreviewPrevious,
} from '../model/index.js';
import { diffText } from './text-diff.js';
import { createVersionChanges, refreshVersionChanges, versionChanges } from './version-changes.js';
import { compareVersions, compareWithOlder, readOlderVersion } from './version-compare.js';
import { changeLineMarks, versionChangeDecorations } from './version-decorations.js';

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

  it('DOCE-VERSIONS-1.6 does not show suggested-deleted text a second time as deleted text', () => {
    const deletion = { type: 'deletion', attrs: { id: 's1', author: 'w' } };
    const keys = (older: StoredNode, newer: StoredNode) => {
      const doc = read(newer);
      const changes = compareVersions(read(older), doc, { suggestions: 'accepted' });
      return versionChangeDecorations(doc, changes, 'markup')
        .find()
        .map((decoration) => String((decoration.spec as { key?: string }).key ?? ''));
    };
    // Struck text alone: its line keeps a deletion bar, with no deleted text beside the struck.
    const struck = keys(paragraph('a0000001', 'Keep every word'), {
      type: 'paragraph',
      attrs: { id: 'a0000001' },
      content: [
        { type: 'text', text: 'Keep ' },
        { type: 'text', text: 'every ', marks: [deletion] },
        { type: 'text', text: 'word' },
      ],
    });
    expect(struck.filter((key) => key.startsWith('del-'))).toEqual([
      expect.stringMatching(/^del-markup-false-\d+-every $/),
    ]);
    // Struck text replaced by a suggested insertion: the struck word is not repeated either.
    const replaced = keys(paragraph('a0000001', 'every'), {
      type: 'paragraph',
      attrs: { id: 'a0000001' },
      content: [
        { type: 'text', text: 'every', marks: [deletion] },
        {
          type: 'text',
          text: 'each',
          marks: [{ type: 'insertion', attrs: { id: 's1', author: 'w' } }],
        },
      ],
    });
    expect(replaced.filter((key) => key.endsWith('-every'))).toEqual([]);
    // Text deleted outright, with no suggestion, still shows as deleted text.
    const plain = keys(
      paragraph('a0000001', 'Keep every word'),
      paragraph('a0000001', 'Keep word'),
    );
    expect(plain).toContainEqual(expect.stringMatching(/^del-markup-true-\d+-every $/));
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

describe('comparing structure, pairing and targets', () => {
  const item = (id: string, value: string): StoredNode => ({
    type: 'listItem',
    attrs: { id: `${id}9` },
    content: [paragraph(id, value)],
  });
  const linked = (href: string): StoredNode => ({
    type: 'paragraph',
    attrs: { id: 'a0000001' },
    content: [
      { type: 'text', text: 'See ' },
      { type: 'text', text: 'the site', marks: [{ type: 'link', attrs: { href } }] },
    ],
  });
  const cited = (target: string, label: string): StoredNode => ({
    type: 'paragraph',
    attrs: { id: 'a0000001' },
    content: [
      { type: 'text', text: 'See ' },
      { type: 'text', text: label, marks: [{ type: 'reference', attrs: { target } }] },
    ],
  });
  const facts = (older: StoredNode[], newer: StoredNode[], generated = false) =>
    compareVersions(read(...older), read(...newer), { generated }).map((change) => ({
      kind: change.kind,
      text: change.text,
      structureChanged: change.structureChanged,
      targets: change.targets,
      generated: change.generated,
    }));

  it('DOCE-VERSIONS-1.7 finds blocks wrapped in, taken out of or moved between containers', () => {
    const plain = [paragraph('a0000001', 'One'), paragraph('a0000002', 'Two')];
    const listed: StoredNode[] = [
      { type: 'bulletList', attrs: { id: 'b0000001' }, content: [item('a0000001', 'One')] },
      paragraph('a0000002', 'Two'),
    ];
    const ordered: StoredNode[] = [
      { type: 'orderedList', attrs: { id: 'b0000001' }, content: [item('a0000001', 'One')] },
      paragraph('a0000002', 'Two'),
    ];
    const quoted: StoredNode[] = [
      paragraph('a0000001', 'One'),
      { type: 'blockquote', attrs: { id: 'b0000002' }, content: [paragraph('a0000002', 'Two')] },
    ];
    const formatting = {
      kind: 'formatting',
      structureChanged: true,
      targets: [],
      generated: false,
    };
    expect(facts(plain, listed)).toEqual([{ ...formatting, text: 'One' }]);
    expect(facts(listed, ordered)).toEqual([{ ...formatting, text: 'One' }]);
    expect(facts(quoted, plain)).toEqual([{ ...formatting, text: 'Two' }]);
    const [edited] = compareVersions(
      read(...plain),
      read(...quoted.slice(0, 1), {
        type: 'blockquote',
        attrs: { id: 'b0000002' },
        content: [paragraph('a0000002', 'Two more')],
      }),
    );
    expect(edited).toMatchObject({
      kind: 'modification',
      structureChanged: true,
      formatChanged: true,
    });
  });

  it('DOCE-VERSIONS-1.7 finds a table cell merged or split', () => {
    const cell = (id: string, value: string, colspan = 1): StoredNode => ({
      type: 'tableCell',
      attrs: { id: `${id}9`, colspan },
      content: [paragraph(id, value)],
    });
    const table = (...cells: StoredNode[]): StoredNode => ({
      type: 'table',
      attrs: { id: 'c0000001' },
      content: [{ type: 'tableRow', attrs: { id: 'c0000002' }, content: cells }],
    });
    expect(
      facts(
        [table(cell('a0000001', 'Left'), cell('a0000002', 'Right'))],
        [table(cell('a0000001', 'Left', 2))],
      ),
    ).toEqual([
      { kind: 'formatting', text: 'Left', structureChanged: true, targets: [], generated: false },
      {
        kind: 'deletion',
        text: 'Right',
        structureChanged: undefined,
        targets: undefined,
        generated: undefined,
      },
    ]);
  });

  it('DOCE-VERSIONS-1.8 pairs blocks without ids by how alike their words are', () => {
    const bare = (value: string): StoredNode => ({
      type: 'paragraph',
      content: [{ type: 'text', text: value }],
    });
    const older = [bare('The pump starts when the tank is low.'), bare('Valves close at night.')];
    const newer = [
      bare('The pump starts when the tank is nearly empty.'),
      bare('Lights dim at dusk.'),
    ];
    expect(summary(older, newer)).toEqual([
      ['modification', null, 'The pump starts when the tank is nearly empty.'],
      ['insertion', null, 'Lights dim at dusk.'],
      ['deletion', null, 'Valves close at night.'],
    ]);
    // A block alike two others pairs with the likest, and each older block pairs once.
    expect(
      summary(
        [bare('Red green blue'), bare('Red green blue yellow')],
        [bare('Red green blue yellow!')],
      ),
    ).toEqual([
      ['deletion', null, 'Red green blue'],
      ['modification', null, 'Red green blue yellow!'],
    ]);
  });

  it('DOCE-VERSIONS-1.9 tells a link or reference whose target changed from formatting', () => {
    expect(facts([linked('https://example.com/a')], [linked('https://example.com/b')])).toEqual([
      {
        kind: 'modification',
        text: 'See the site',
        structureChanged: false,
        targets: ['link'],
        generated: false,
      },
    ]);
    expect(facts([cited('a0000002', 'the heading')], [cited('a0000003', 'the heading')])).toEqual([
      {
        kind: 'modification',
        text: 'See the heading',
        structureChanged: false,
        targets: ['reference'],
        generated: false,
      },
    ]);
  });

  it('DOCE-VERSIONS-1.10 leaves out values the document generates, unless asked', () => {
    const older = [cited('a0000002', 'Section 3')];
    const newer = [cited('a0000002', 'Section 10')];
    expect(facts(older, newer)).toEqual([]);
    expect(facts(older, newer, true)).toEqual([
      {
        kind: 'modification',
        text: 'See Section 10',
        structureChanged: false,
        targets: [],
        generated: true,
      },
    ]);
    const script = (output: string): StoredNode => ({
      type: 'script',
      attrs: { id: 'e0000001', source: 'return [];' },
      content: [paragraph('e0000002', output)],
    });
    expect(facts([script('Generated')], [script('Generated again')])).toEqual([]);
    expect(facts([script('Generated')], [script('Generated again')], true)).toMatchObject([
      { kind: 'modification', generated: true },
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

// Element ids in order, as an editor would give them.
function counter() {
  let next = 0;
  return () => (next += 1).toString(16).padStart(8, '0');
}

describe('the template preview compared with its older version', () => {
  it('DOCE-TEMPLATES-8.8 shows a change of each kind', () => {
    const template = { formatVersion: 1 as const, id: 'preview' };
    const shown = assignStoredIds(templatePreviewDocument(template), { newId: counter() });
    const newer = readDocumentFile(shown, documentSchema).doc;
    const older = readDocumentFile(templatePreviewPrevious(shown), documentSchema).doc;
    const kinds = compareWithOlder(readOlderVersion(older), newer).map((change) => change.kind);
    expect([...new Set(kinds)].sort()).toEqual([
      'deletion',
      'formatting',
      'insertion',
      'modification',
    ]);
  });
});
