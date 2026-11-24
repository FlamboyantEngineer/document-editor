import { Fragment } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { diffFragments } from './fragment-diff.js';

const text = (value: string) => Fragment.from(documentSchema.text(value));

function inline(...parts: (string | 'atom')[]): Fragment {
  const atom = documentSchema.nodes.hard_break;
  if (!atom) throw new Error('hard_break');
  return Fragment.fromArray(
    parts.map((part) => (part === 'atom' ? atom.create() : documentSchema.text(part))),
  );
}

describe('diffFragments', () => {
  it('DOCE-COLLAB-4.1 gives no range for equal content', () => {
    expect(diffFragments(text('Same text'), text('Same text'))).toBeNull();
  });

  it('DOCE-COLLAB-4.1 keeps both ends after the start where repeated text is added or removed', () => {
    expect(diffFragments(text('a.'), text('a. b.'))).toEqual({ start: 2, endA: 2, endB: 5 });
    expect(diffFragments(text('a. b.'), text('a.'))).toEqual({ start: 2, endA: 5, endB: 2 });
    expect(diffFragments(text('aaa'), text('aaaa'))).toEqual({ start: 3, endA: 3, endB: 4 });
  });

  it('DOCE-COLLAB-4.1 counts an inline atom as one and a character outside the basic plane as two', () => {
    expect(diffFragments(inline('ab', 'atom', 'cd'), inline('ab', 'cd'))).toEqual({
      start: 2,
      endA: 3,
      endB: 2,
    });
    // ProseMirror starts the difference before the high half of a pair the two share.
    expect(diffFragments(text('x😀y'), text('x😁y'))).toEqual({ start: 1, endA: 3, endB: 3 });
  });
});
