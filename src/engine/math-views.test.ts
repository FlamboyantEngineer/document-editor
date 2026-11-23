import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { createDocumentEditing } from './document-editing.js';
import { createMathViews, DEFAULT_INVALID_MATH_TEXT, typesetMathOf } from './math-views.js';

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

describe('typeset math kept for static drawings', () => {
  it('DOCE-PAGINATION-13.2 keeps what each math node was typeset as, its MathML held to the allow-list', async () => {
    const render = (source: string) => ({
      ok: true as const,
      mathml: `<math><mi onclick="alert(1)">${source}</mi><script>alert(2)</script></math>`,
    });
    const plugins = [createMathViews({ render })];
    const inline = nodes.math_inline?.create(null, documentSchema.text('x'));
    const paragraph = nodes.paragraph?.create(null, inline ? [inline] : []);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!inline || !doc) throw new Error('The schema has math');
    const state = EditorState.create({ doc, plugins });
    expect(typesetMathOf(state, inline)).toBeNull();
    view = new EditorView(document.createElement('div'), { state });
    await expect.poll(() => typesetMathOf(state, inline)?.state).toBe('ready');
    const typeset = typesetMathOf(state, inline);
    if (typeset?.state !== 'ready') throw new Error('typeset');
    expect(JSON.stringify(typeset.math)).not.toMatch(/script|onclick/u);
    expect(typeset.math.tag).toBe('math');
    // Refused math keeps what invalid math shows.
    const refused = EditorState.create({ doc, plugins: [createMathViews({ render: refuse })] });
    view.destroy();
    view = new EditorView(document.createElement('div'), { state: refused });
    await expect
      .poll(() => typesetMathOf(refused, inline))
      .toEqual({
        state: 'invalid',
        text: DEFAULT_INVALID_MATH_TEXT.inline,
        message: 'Expected group after "\\frac"',
      });
  });
});

describe('a renderer that does not answer', () => {
  it('DOCE-PAGINATION-10.8 shows math invalid once its renderer misses the deadline, and a later answer still', async () => {
    vi.useFakeTimers();
    let answer: (value: { ok: true; mathml: string }) => void = () => {};
    const render = () =>
      new Promise<{ ok: true; mathml: string }>((resolve) => {
        answer = resolve;
      });
    const plugins = [createMathViews({ render, timeout: 5_000, timeoutMessage: 'Too slow' })];
    const inline = nodes.math_inline?.create(null, documentSchema.text('x'));
    const paragraph = nodes.paragraph?.create(null, inline ? [inline] : []);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!inline || !doc) throw new Error('The schema has math');
    const state = EditorState.create({ doc, plugins });
    view = new EditorView(document.createElement('div'), { state });
    const drawn = view.dom.querySelector<HTMLElement>('.de-math');
    const remeasured = vi.fn();
    drawn?.addEventListener('de-remeasure', remeasured);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(drawn?.dataset.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(drawn?.dataset.state).toBe('invalid');
    expect(drawn?.title).toBe('Too slow (5 s)');
    expect(drawn?.textContent).toBe(DEFAULT_INVALID_MATH_TEXT.inline);
    expect(remeasured).toHaveBeenCalledTimes(1);
    expect(typesetMathOf(state, inline)?.state).toBe('invalid');
    answer({ ok: true, mathml: '<math><mi>x</mi></math>' });
    await vi.advanceTimersByTimeAsync(0);
    expect(drawn?.dataset.state).toBe('ready');
    expect(remeasured).toHaveBeenCalledTimes(2);
    expect(typesetMathOf(state, inline)?.state).toBe('ready');
    vi.useRealTimers();
  });
});
