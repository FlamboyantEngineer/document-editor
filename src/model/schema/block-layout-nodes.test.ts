import { describe, expect, it } from 'vitest';
import { documentSchema, findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';

describe('block layout nodes', () => {
  it('DOCE-SCHEMA-3.6 keeps a layout section and its columns at the top level', () => {
    const html =
      '<div class="doc-layout-section" data-layout-preset="thirds"><div class="doc-layout-column" data-layout-column=""><p>A</p></div><div class="doc-layout-column" data-layout-column=""><p>B</p></div></div>';
    const section = findNode(parseMarkup(html), 'layout_section');
    expect(section?.attrs.preset).toBe('thirds');
    expect(section?.childCount).toBe(2);
    expect(roundTrip(html)).toBe(html);
    expect(documentSchema.nodes.layout_section?.isInGroup('block')).toBe(false);
    expect(documentSchema.nodes.layout_column?.createAndFill()?.firstChild?.type.name).toBe(
      'paragraph',
    );
  });

  it('DOCE-SCHEMA-3.6 keeps a preset it does not know and reads a malformed one as the default', () => {
    const layout = (preset: string) =>
      `<div data-layout-preset="${preset}"><div data-layout-column=""><p>A</p></div></div>`;
    expect(findNode(parseMarkup(layout('nine')), 'layout_section')?.attrs.preset).toBe('nine');
    expect(findNode(parseMarkup(layout('Nine!')), 'layout_section')?.attrs.preset).toBe('halves');
  });

  it('DOCE-SCHEMA-3.6 keeps a table of contents with its range of entries', () => {
    const html =
      '<div data-toc-block="true" data-toc-type="figures" data-min-level="3" data-entry-start="4" data-show-title="false" class="toc-block" data-ref-filter="fig" data-entry-end="9"></div>';
    expect(findNode(parseMarkup(html), 'toc_block')?.attrs).toMatchObject({
      tocType: 'figures',
      minLevel: 3,
      entryStart: 4,
      entryEnd: 9,
      showTitle: false,
    });
    expect(roundTrip(html)).toBe(html);
  });
});
