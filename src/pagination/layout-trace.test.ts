import { TextSelection } from 'prosemirror-state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { edit, mount, positionOf } from '../../test/projection-fixtures.js';
import { type LayoutTrace, traceLine, writeTrace } from './layout-trace.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('layout trace', () => {
  it('DOCE-PAGINATION-7.20 writes an event and its values under short keys', () => {
    expect(traceLine('layout', { layouts: 3, pages: 24, duration: 4.25 })).toBe(
      'layout n=3 pg=24 ms=4.250',
    );
    expect(traceLine('layout.skip', { reason: 'composing' })).toBe('layout.skip why=composing');
    expect(traceLine('settle')).toBe('settle');
  });

  it('DOCE-PAGINATION-7.20 makes nothing while nothing reads the trace', () => {
    const values = vi.fn(() => ({ pages: 1 }));
    writeTrace(() => null, 'layout', values);
    writeTrace(undefined, 'layout', values);
    expect(values).not.toHaveBeenCalled();
  });

  it('DOCE-PAGINATION-7.20 tells of layouts, mirrors and scheduling while it is read', () => {
    const lines: LayoutTrace[] = [];
    let reading = true;
    const write = (entry: LayoutTrace) => lines.push(entry);
    const { projection, drain } = mount({ settle: 150, trace: () => (reading ? write : null) });
    drain();
    expect(lines[0]).toMatchObject({
      kind: 'render',
      line: expect.stringMatching(/^layout n=1 pg=3 ms=/),
    });
    lines.length = 0;
    edit(projection, (state) => state.tr.insertText('x', positionOf(state.doc, 'Beta')));
    expect(lines.map(({ kind, line }) => `${kind} ${line}`)).toEqual([
      'render mirror',
      'trace settle',
    ]);
    lines.length = 0;
    reading = false;
    edit(projection, (state) =>
      state.tr.setSelection(TextSelection.create(state.doc, positionOf(state.doc, 'Gamma'))),
    );
    expect(lines).toEqual([]);
  });
});
