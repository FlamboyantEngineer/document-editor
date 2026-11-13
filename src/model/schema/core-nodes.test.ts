import { DOMSerializer } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema, roundTrip } from '../../../test/document-markup.js';

describe('core nodes', () => {
  it('DOCE-TEMPLATES-7.1 keeps a block style that is one custom style name', () => {
    const html = '<p class="note">Aside</p><h2 class="lead-2">Title</h2>';
    expect(roundTrip(html)).toBe(html);
    expect(roundTrip('<p class=" note ">Aside</p>')).toBe('<p class="note">Aside</p>');
  });

  it('DOCE-TEMPLATES-7.1 keeps no class that is not one custom style name', () => {
    // Markup pasted from a page carries the classes of that page's stylesheet.
    const pasted =
      '<p class="hidden fixed inset-0 ProseMirror-selectednode">A</p><h2 class="sr-only x">B</h2><p class="hover:underline">C</p>';
    expect(roundTrip(pasted)).toBe('<p>A</p><h2>B</h2><p>C</p>');
    // A stored or synced block holds what it was given, and is written without a class.
    for (const name of ['paragraph', 'heading'] as const) {
      const block = documentSchema.nodes[name]?.create({ className: 'hidden fixed inset-0' });
      if (!block) throw new Error('The schema has paragraphs and headings');
      const dom = DOMSerializer.fromSchema(documentSchema).serializeNode(block) as HTMLElement;
      expect(dom).not.toHaveAttribute('class');
    }
  });
});
