// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StoredNode } from '../document-format.js';
import {
  commentEnds,
  commentStarts,
  createWordComments,
  type WordCommentThread,
  writeCommentParts,
} from './comments.js';

const marked = (text: string, thread: string, extra: string[] = []): StoredNode => ({
  type: 'text',
  text,
  marks: [{ type: 'comment', attrs: { thread } }, ...extra.map((type) => ({ type }))],
});

const threads: WordCommentThread[] = [
  {
    id: 't1',
    state: 'resolved',
    entries: [
      { author: 'p1', text: 'First\nline two', createdAt: '2026-11-13T10:00:00Z' },
      { author: 'p2', text: 'Reply' },
    ],
  },
  { id: 't2', state: 'open', entries: [{ author: 'p1', text: 'Gone with its text' }] },
  { id: 't3', state: 'open', entries: [{ author: 'p1', text: 'Not anchored' }] },
];

describe('Word comments', () => {
  const first = marked('Alpha', 't1');
  const second = marked('Beta', 't1');
  const deleted = marked('Old', 't2', ['deletion']);
  const content: StoredNode[] = [
    { type: 'paragraph', content: [first] },
    { type: 'paragraph', content: [second, deleted] },
  ];
  const comments = createWordComments(content, {
    threads,
    authorName: (author) => (author === 'p1' ? 'Ada Lane' : null),
    suggestions: 'accepted',
  });

  it('DOCE-FORMAT-5.7 wraps a thread’s text from its first node to its last, one comment per entry', () => {
    expect(commentStarts(comments, first)).toBe(
      '<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>',
    );
    expect(commentEnds(comments, first)).toBe('');
    expect(commentStarts(comments, second)).toBe('');
    expect(commentEnds(comments, second)).toContain('<w:commentRangeEnd w:id="1"/>');
    expect(commentEnds(comments, second)).toContain('<w:commentReference w:id="0"/>');
  });

  it('DOCE-FORMAT-5.7 writes authors, dates, replies and resolution, leaving out threads not anchored', () => {
    const parts = writeCommentParts(comments);
    expect(parts?.comments).toContain('w:author="Ada Lane"');
    expect(parts?.comments).toContain('w:date="2026-11-13T10:00:00Z" w:initials="AL"');
    expect(parts?.comments).toContain('w:author="p2"');
    expect(parts?.comments).toContain('First</w:t><w:br/><w:t xml:space="preserve">line two');
    expect(parts?.comments).not.toContain('Gone with its text');
    expect(parts?.comments).not.toContain('Not anchored');
    expect(parts?.extended).toContain('<w15:commentEx w15:paraId="00000001" w15:done="1"/>');
    expect(parts?.extended).toContain(
      'w15:paraId="00000002" w15:paraIdParent="00000001" w15:done="0"',
    );
    expect(writeCommentParts(createWordComments([], { suggestions: 'accepted' }))).toBeNull();
  });
});
