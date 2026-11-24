import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema, findNode, parseMarkup } from '../../../test/document-markup.js';
import { readDocumentFile } from '../../model/index.js';
import { CONTEXT_MENU_GROUPS, contextGroups } from './context-entries.js';
import { resolveContextTarget } from './context-target.js';
import { DEFAULT_EDITOR_LABELS as labels } from './editor-labels.js';

const SOURCE = String.raw`\frac{a}{b}`;
const MATHML = 'http://www.w3.org/1998/Math/MathML';
const SVG = 'http://www.w3.org/2000/svg';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  Reflect.deleteProperty(window.navigator, 'clipboard');
  vi.unstubAllGlobals();
});

class Item {
  constructor(readonly values: Record<string, Blob | Promise<Blob>>) {}
}

// A clipboard that records what is written to it.
function recordClipboard() {
  const written: Array<Record<string, Blob | Promise<Blob>> | string> = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      write: (items: Item[]) => {
        written.push(items[0]?.values ?? {});
        return Promise.resolve();
      },
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  vi.stubGlobal('ClipboardItem', Item);
  return written;
}

// A paragraph and display math, the math selected; `drawn` adds its typeset MathML and drawing.
function setUp({ drawn }: { drawn: boolean }) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
            { type: 'mathBlock', attrs: { source: SOURCE } },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let mathPos = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === 'math_display') mathPos = pos;
  });
  const state = EditorState.create({ doc });
  const shown = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: state.apply(state.tr.setSelection(NodeSelection.create(doc, mathPos))),
  });
  view = shown;
  const dom = shown.nodeDOM(mathPos) as HTMLElement;
  if (drawn) {
    dom.style.setProperty('--de-math-scale', '0.5');
    const drawing = document.createElementNS(SVG, 'svg');
    drawing.setAttribute('class', 'de-math__drawing');
    drawing.setAttribute('width', '20');
    drawing.setAttribute('height', '10');
    const math = document.createElementNS(MATHML, 'math');
    math.setAttribute('display', 'block');
    math.append(document.createElementNS(MATHML, 'mfrac'));
    dom.append(drawing, math);
  }
  const entries = () => {
    const target = resolveContextTarget(shown.state, shown.state.selection.head, true);
    const groups = contextGroups(shown, target, {
      labels,
      editable: false,
      suggestionPolicy: { me: null, canDecide: false, canWithdraw: false },
      startComment: null,
    });
    return groups.find((group) => group.id === 'clipboard')?.entries ?? [];
  };
  return { shown, entries };
}

const entryOf = (entries: ReturnType<ReturnType<typeof setUp>['entries']>, id: string) => {
  const entry = entries.find((each) => 'id' in each && each.id === id);
  if (!entry || !('onAction' in entry)) throw new Error(`No ${id} entry.`);
  return entry;
};

describe('math copy entries', () => {
  it('DOCE-OBJECTS-1.12 offers the three copies after Copy at math, even read-only', () => {
    recordClipboard();
    const { entries } = setUp({ drawn: true });
    expect(entries().map((entry) => ('label' in entry ? entry.label : entry.type))).toEqual([
      'Cut',
      'Copy',
      'Copy equation',
      "Copy equation's LaTeX",
      'Copy equation as image',
      'Paste',
      'Paste as plain text',
    ]);
    expect(CONTEXT_MENU_GROUPS).toContain('clipboard');
  });

  it('DOCE-OBJECTS-1.12 offers none away from math, and only the LaTeX before it is drawn', () => {
    recordClipboard();
    const { shown, entries } = setUp({ drawn: false });
    expect(entryOf(entries(), 'copy-equation').isDisabled).toBe(true);
    expect(entryOf(entries(), 'copy-equation-image').isDisabled).toBe(true);
    expect(entryOf(entries(), 'copy-equation-latex').isDisabled).toBe(false);
    shown.dispatch(shown.state.tr.setSelection(TextSelection.atStart(shown.state.doc)));
    expect(entries().some((entry) => 'id' in entry && entry.id === 'copy-equation')).toBe(false);
  });

  it('DOCE-OBJECTS-1.12 copies the equation as MathML with its LaTeX, and the LaTeX as text', async () => {
    const written = recordClipboard();
    const { entries } = setUp({ drawn: true });
    entryOf(entries(), 'copy-equation').onAction?.();
    await vi.waitFor(() => expect(written).toHaveLength(1));
    const formats = written[0] as Record<string, Blob>;
    const markup = await formats['text/html']?.text();
    expect(markup).toBe(
      `<math xmlns="${MATHML}" display="block"><semantics><mrow><mfrac/></mrow><annotation encoding="application/x-tex">${SOURCE}</annotation></semantics></math>`,
    );
    await expect(formats['text/plain']?.text()).resolves.toBe(markup);
    entryOf(entries(), 'copy-equation-latex').onAction?.();
    await vi.waitFor(() => expect(written[1]).toBe(SOURCE));
  });

  it('DOCE-OBJECTS-1.12 copies the drawing as an image at its size before scaling, with its LaTeX', async () => {
    const written = recordClipboard();
    const { entries } = setUp({ drawn: true });
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = create(tag);
      if (tag === 'img')
        Object.defineProperty(element, 'src', {
          set: () => queueMicrotask(() => element.dispatchEvent(new Event('load'))),
        });
      if (tag === 'canvas')
        Object.assign(element, {
          getContext: () => ({ drawImage: () => undefined }),
          toBlob: (done: (blob: Blob) => void) => done(new Blob(['png'], { type: 'image/png' })),
        });
      return element;
    });
    entryOf(entries(), 'copy-equation-image').onAction?.();
    await vi.waitFor(() => expect(written).toHaveLength(1));
    const formats = written[0] as Record<string, Promise<Blob>>;
    await expect((await formats['image/png'])?.text()).resolves.toBe('png');
    await expect((await formats['text/html'])?.text()).resolves.toBe(
      `<img src="data:image/png;base64,cG5n" width="40" height="20" alt="${SOURCE}" data-latex="${SOURCE}" data-math-display="display">`,
    );
  });
});

describe('pasted equations', () => {
  it('DOCE-OBJECTS-1.12 reads MathML with a TeX annotation back as math of its display', () => {
    const annotated = (display: string, tex: string) =>
      `<math xmlns="${MATHML}"${display}><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math>`;
    const doc = parseMarkup(
      `<p>Area ${annotated('', String.raw`\pi r^2`)} here</p>${annotated(' display="block"', SOURCE)}<p><math><mi>y</mi></math></p>`,
    );
    expect(findNode(doc, 'math_inline')?.textContent).toBe(String.raw`\pi r^2`);
    expect(findNode(doc, 'math_display')?.textContent).toBe(SOURCE);
    expect(doc.lastChild?.textContent).toBe('y');
  });

  it('DOCE-OBJECTS-1.12 reads an image of math carrying its LaTeX back as math, other images as images', () => {
    const doc = parseMarkup(
      `<p>Area <img src="a.png" alt="" data-latex="\\pi r^2"> and <img src="b.png" alt="b"></p><img src="c.png" data-latex="${SOURCE}" data-math-display="display">`,
    );
    expect(findNode(doc, 'math_inline')?.textContent).toBe(String.raw`\pi r^2`);
    expect(findNode(doc, 'math_display')?.textContent).toBe(SOURCE);
    expect(findNode(doc, 'image')?.attrs.src).toBe('b.png');
  });
});
