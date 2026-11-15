import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { measureCanvasText } from './canvas-text-measure.js';

const style = {
  width: '57px',
  lineHeight: '20px',
  boxSizing: 'content-box',
  whiteSpace: 'pre-wrap',
  writingMode: 'horizontal-tb',
  direction: 'ltr',
  textTransform: 'none',
  letterSpacing: 'normal',
  wordSpacing: '0px',
  textIndent: '0px',
  wordBreak: 'normal',
  hyphens: 'manual',
  fontVariant: 'normal',
  fontFeatureSettings: 'normal',
  fontVariationSettings: 'normal',
  fontStretch: '100%',
  textWrapStyle: 'auto',
  fontStyle: 'normal',
  fontWeight: '400',
  fontSize: '16px',
  fontFamily: 'serif',
  fontKerning: 'auto',
  textRendering: 'auto',
  content: 'none',
};
const measureText = vi.fn((text: string) => ({ width: text.length * 5 }));
const getClientRects = vi.fn(() => [new DOMRect(0, 0, 60, 18), new DOMRect(0, 20, 55, 18)]);

function paragraph(text = 'Hello world again today', overrides = {}) {
  vi.spyOn(document, 'createRange').mockReturnValue({
    selectNodeContents: vi.fn(),
    getClientRects,
  } as unknown as Range);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    ...style,
    ...overrides,
  } as CSSStyleDeclaration);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText,
  } as unknown as CanvasRenderingContext2D);
  const element = document.createElement('p');
  element.textContent = text;
  const node = documentSchema.node('paragraph', null, documentSchema.text(text));
  return { element, node };
}

afterEach(() => vi.restoreAllMocks());

describe('canvas text measuring', () => {
  it('DOCE-PAGINATION-5.14 caches line boundaries in CSS pixels for repeated split queries', () => {
    const { element, node } = paragraph();
    const measured = measureCanvasText(element, node);
    expect(measured).not.toBeNull();
    expect(measured?.measure(0, 11)).toEqual({ height: 18, lines: 1 });
    expect(measured?.measure(0, node.content.size)).toEqual({ height: 38, lines: 2 });
    const calls = measureText.mock.calls.length;
    const ranges = getClientRects.mock.calls.length;
    expect(measured?.measure(12, node.content.size)).toEqual({ height: 18, lines: 1 });
    expect(measured?.measure(5, 5)).toEqual({ height: 0, lines: 0 });
    expect(measureText).toHaveBeenCalledTimes(calls);
    expect(getClientRects).toHaveBeenCalledTimes(ranges);
  });

  it.each([
    ['wide word', 'Incomprehensibly', {}],
    ['rounding boundary', 'Hello world', { width: '55.05px' }],
    ['non-Latin text', 'Bonjour été', {}],
    ['preserved whitespace', 'Hello  world', {}],
    ['font features', 'Hello world', { fontFeatureSettings: '"smcp"' }],
    ['generated content', 'Hello world', { content: '"1."' }],
    ['balanced wrapping', 'Hello world', { textWrapStyle: 'balance' }],
    ['unknown line height', 'Hello world', { lineHeight: 'normal' }],
  ])('DOCE-PAGINATION-5.14 uses DOM ranges for %s', (_name, text, overrides) => {
    const { element, node } = paragraph(text, overrides);
    expect(measureCanvasText(element, node)).toBeNull();
  });

  it('DOCE-PAGINATION-5.14 leaves decorated text and marks to the DOM', () => {
    const { element, node } = paragraph();
    const span = document.createElement('span');
    span.textContent = element.textContent;
    element.replaceChildren(span);
    expect(measureCanvasText(element, node)).toBeNull();
    element.textContent = node.textContent;
    const marked = documentSchema.node(
      'paragraph',
      null,
      documentSchema.text(node.textContent, [documentSchema.mark('strong')]),
    );
    expect(measureCanvasText(element, marked)).toBeNull();
  });

  it('DOCE-PAGINATION-5.14 falls back when the browser wraps text differently', () => {
    const { element, node } = paragraph();
    getClientRects.mockReturnValueOnce([new DOMRect(0, 0, 40, 18)]);
    expect(measureCanvasText(element, node)).toBeNull();
  });

  it('DOCE-PAGINATION-5.14 validates each line even when the total line count agrees', () => {
    const { element, node } = paragraph();
    getClientRects.mockReturnValueOnce([new DOMRect(0, 0, 53, 18), new DOMRect(0, 20, 55, 18)]);
    expect(measureCanvasText(element, node)).toBeNull();
  });

  it('DOCE-PAGINATION-5.14 keeps fractional line spacing in CSS pixels at zoom', () => {
    const { element, node } = paragraph();
    getClientRects.mockReturnValueOnce([
      new DOMRect(0, 0, 75, 22.5),
      new DOMRect(0, 25.3125, 68.75, 22.5),
    ]);
    expect(measureCanvasText(element, node, 1.25)?.measure(0, node.content.size)).toEqual({
      height: 38.25,
      lines: 2,
    });
  });

  it('DOCE-PAGINATION-5.14 leaves mixed line heights to DOM ranges', () => {
    const { element, node } = paragraph();
    getClientRects.mockReturnValueOnce([new DOMRect(0, 0, 60, 24), new DOMRect(0, 24, 55, 18)]);
    expect(measureCanvasText(element, node)).toBeNull();
  });
});
