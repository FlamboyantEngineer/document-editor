import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { createDocumentEditing } from './document-editing.js';
import { createMathViews, DEFAULT_INVALID_MATH_TEXT } from './math-views.js';

installEditorDom();

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

const { nodes } = documentSchema;

// A document of inline math in a paragraph and a math block, both invalid to the renderer given.
function docOfMath() {
  const inline = nodes.math_inline?.create(null, documentSchema.text('\\frac{'));
  const paragraph = nodes.paragraph?.create(null, [
    documentSchema.text('See '),
    ...(inline ? [inline] : []),
  ]);
  const block = nodes.math_display?.create(null, documentSchema.text('\\sqrt{'));
  if (!paragraph || !block) throw new Error('The schema has math');
  const doc = documentSchema.topNodeType.createAndFill(null, [paragraph, block]);
  if (!doc) throw new Error('The document is valid');
  return doc;
}

const refuse = () => ({ ok: false as const, message: 'Expected group after "\\frac"' });

describe('invalid math', () => {
  it('DOCE-OBJECTS-1.7 says invalid math is invalid, inline and as a block, its reason as its title', async () => {
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: docOfMath(),
        plugins: [createMathViews({ render: refuse })],
      }),
    });
    const [inline, block] = [...view.dom.querySelectorAll('.de-math')];
    await expect.poll(() => inline?.getAttribute('data-state')).toBe('invalid');
    await expect.poll(() => block?.getAttribute('data-state')).toBe('invalid');
    expect(inline?.textContent).toBe(DEFAULT_INVALID_MATH_TEXT.inline);
    expect(block?.textContent).toBe(DEFAULT_INVALID_MATH_TEXT.display);
    expect(inline?.getAttribute('title')).toBe('Expected group after "\\frac"');
  });

  it("DOCE-OBJECTS-1.7 shows the host's own words for invalid math", async () => {
    const plugins = createDocumentEditing(documentSchema, {
      invalidMath: { inline: '! Error !', display: 'Invalid LaTeX code' },
    });
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc: docOfMath(), plugins }),
    });
    const [inline, block] = [...view.dom.querySelectorAll('.de-math')];
    await expect.poll(() => inline?.textContent).toBe('! Error !');
    await expect.poll(() => block?.textContent).toBe('Invalid LaTeX code');
  });
});
