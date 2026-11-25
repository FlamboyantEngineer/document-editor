import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import { placeMath } from '../layout-engine/math-atoms.js';
import { createDocumentEditing } from './document-editing.js';
import { mathDrawingHooks } from './math-drawing.js';
import {
  createMathViews,
  DEFAULT_INVALID_MATH_TEXT,
  mathTypesetReady,
  typesetMathOf,
} from './math-views.js';

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
  it('DOCE-PAGINATION-10.8 shows math invalid once its renderer misses the deadline, and keeps it so', async () => {
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
    // The pages were laid out with the invalid math, so an answer after the deadline changes nothing.
    answer({ ok: true, mathml: '<math><mi>x</mi></math>' });
    await vi.advanceTimersByTimeAsync(0);
    expect(drawn?.dataset.state).toBe('invalid');
    expect(remeasured).toHaveBeenCalledTimes(1);
    expect(typesetMathOf(state, inline)?.state).toBe('invalid');
    vi.useRealTimers();
  });
});

describe('math typeset ahead', () => {
  it('DOCE-PAGINATION-10.8 typesets each source once for every view, and says when a document is typeset', async () => {
    const render = vi.fn((source: string) => ({
      ok: true as const,
      mathml: `<math><mi>${source}</mi></math>`,
    }));
    const plugins = [createMathViews({ render })];
    const inline = nodes.math_inline?.create(null, documentSchema.text('x'));
    const paragraph = nodes.paragraph?.create(null, inline ? [inline] : []);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!doc) throw new Error('The schema has math');
    const state = EditorState.create({ doc, plugins });
    // The pages wait for the document's math before any view draws it.
    const ready = mathTypesetReady(state, doc, document);
    expect(ready).not.toBeNull();
    await ready;
    expect(mathTypesetReady(state, doc, document)).toBeNull();
    view = new EditorView(document.createElement('div'), { state });
    const other = new EditorView(document.createElement('div'), { state });
    for (const each of [view, other])
      await expect
        .poll(() => each.dom.querySelector<HTMLElement>('.de-math')?.dataset.state)
        .toBe('ready');
    expect(other.dom.querySelector('math')?.textContent).toBe('x');
    expect(render).toHaveBeenCalledTimes(1);
    other.destroy();
  });
});

describe("the editing's math options", () => {
  it("DOCE-PAGINATION-10.8 waits for the editing's renderer as long as its timeout, with the host's reason", async () => {
    vi.useFakeTimers();
    const render = () => new Promise<{ ok: true; mathml: string }>(() => undefined);
    const plugins = createDocumentEditing(documentSchema, {
      math: { render, timeout: 2_000, timeoutMessage: 'The typesetter is busy' },
    });
    const inline = nodes.math_inline?.create(null, documentSchema.text('x'));
    const paragraph = nodes.paragraph?.create(null, inline ? [inline] : []);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!doc) throw new Error('The schema has math');
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins }),
    });
    const drawn = view.dom.querySelector<HTMLElement>('.de-math');
    await vi.advanceTimersByTimeAsync(1_999);
    expect(drawn?.dataset.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(drawn?.dataset.state).toBe('invalid');
    expect(drawn?.title).toBe('The typesetter is busy (2 s)');
    vi.useRealTimers();
  });
});

describe('math drawn from its layout', () => {
  it('DOCE-PAGINATION-12.11 draws the SVG its decoration places before the typeset MathML, and again when the placement changes', async () => {
    const render = (source: string) => ({
      ok: true as const,
      mathml: `<math><mi>${source}</mi></math>`,
    });
    const laid = standInMathLayouter().layouter.layout(mathOf(['x']), false, 20);
    if (!laid) throw new Error('the stand-in refused');
    const atom = nodes.math_inline?.create(null, documentSchema.text('x'));
    const paragraph = atom && nodes.paragraph?.create(null, [atom]);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!doc) throw new Error('The document is valid');
    let placed = placeMath({ math: laid }, 600);
    const placing = new Plugin({
      props: {
        decorations: (state) =>
          DecorationSet.create(state.doc, [
            Decoration.node(1, 1 + atom.nodeSize, mathDrawingHooks(placed), {
              mathDrawing: placed,
            }),
          ]),
      },
    });
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createMathViews({ render }), placing] }),
    });
    const math = view.dom.querySelector<HTMLElement>('.de-math');
    await expect.poll(() => math?.dataset.state).toBe('ready');
    expect(math?.dataset.mathLayout).toBe('laid');
    expect([...(math?.children ?? [])].map((child) => child.localName)).toEqual(['svg', 'math']);
    expect(math?.querySelector('svg')?.getAttribute('width')).toBe('10');
    placed = placeMath({ math: laid }, 5);
    view.dispatch(view.state.tr.setMeta('placed', true));
    expect(math?.querySelector('svg')?.getAttribute('width')).toBe('5');
    expect(math?.style.getPropertyValue('--de-math-scale')).toBe('0.5');
  });
});
