import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';
import { mentionPresentation } from '../index.js';

const VECTOR = {
  viewBox: { width: 100, height: 40 },
  paths: [{ d: 'M0 0L10 10', fill: false, strokeWidth: 2 }],
};

describe('inline atom nodes', () => {
  it('DOCE-SCHEMA-3.7 renders a mention with its label, or its id when it has none', () => {
    expect(mentionPresentation({ id: ' u1 ', label: '' }, { mentionClass: 'm' })).toEqual({
      text: '@u1',
      attributes: {
        class: 'm',
        'data-mention-kind': 'user',
        'data-mention-user-id': 'u1',
        'data-mention-label': 'u1',
        'aria-label': '@u1',
        contenteditable: 'false',
        tabindex: '-1',
      },
    });
    const doc = parseMarkup('<p><span data-mention-user-id="u2">@Grace</span></p>');
    expect(findNode(doc, 'mention')?.attrs).toMatchObject({ userId: 'u2', label: 'Grace' });
  });

  it('DOCE-SCHEMA-3.7 shows a glossary reference in full or short and links to its entry', () => {
    const html =
      '<p><span data-abbreviation-ref="e1" data-abbr-display="short" data-abbr="CPU" data-expansion="Central processing unit"></span></p>';
    const node = findNode(parseMarkup(html), 'abbreviation_reference');
    expect(node?.attrs).toMatchObject({ entryId: 'e1', display: 'short', abbr: 'CPU' });
    expect(node?.textContent).toBe('CPU');
    expect(roundTrip(html)).toContain(
      '<a href="#abbr-e1" data-abbr-tooltip="CPU — Central processing unit" title="CPU — Central processing unit" tabindex="0">CPU</a>',
    );
  });

  it('DOCE-SCHEMA-3.7 keeps a signed signature with its vector and drops a vector that is not canonical', () => {
    const vector = JSON.stringify(VECTOR).replaceAll('"', '&quot;');
    const signed = `<p><span class="signature-inline" data-signature="u1" data-signature-name="Ada" data-signature-revision="r1" data-signature-vector="${vector}"></span></p>`;
    const node = findNode(parseMarkup(signed), 'signature');
    expect(node?.attrs).toMatchObject({
      userId: 'u1',
      displayName: 'Ada',
      signatureRevisionId: 'r1',
    });
    expect(node?.attrs.vector).toEqual(VECTOR);
    expect(roundTrip(signed)).toBe(signed);
    const broken = '<p><span data-signature="u1" data-signature-vector="{nope"></span></p>';
    expect(findNode(parseMarkup(broken), 'signature')?.attrs.vector).toBeNull();
    expect(node?.type.spec.draggable).toBe(false);
  });
});
