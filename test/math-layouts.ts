// Equations for the MathJax layouter's tests (DOCE-PAGINATION-12.12): the regression set's math,
// tall equations, and a sweep of what KaTeX typesets, each as the MathML KaTeX gives the editor;
// and one fingerprint of their layouts, so a page, Node and every system can be told apart.

import katex from 'katex';
import type { MathTree } from '../src/engine/math-typeset.js';
import type { MathLayouter } from '../src/layout-engine/math-atoms.js';

/** LaTeX sources: the regression set's, tall ones, and a sweep of KaTeX's functions. */
export const MATH_SOURCES: readonly string[] = [
  'E = mc^2',
  '\\frac{a}{b}',
  'V_{0} = \\pi r^2 h',
  'a^2 + b^2 = c^2',
  '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '\\sqrt{\\frac{x^2+1}{y}} \\leq \\alpha',
  '\\frac{1}{1 + \\frac{1}{1 + \\frac{1}{x}}}',
  '\\begin{pmatrix} a_{11} & a_{12} & a_{13} \\\\ a_{21} & a_{22} & a_{23} \\\\ a_{31} & a_{32} & a_{33} \\end{pmatrix}',
  '\\sum_{\\substack{0 \\le i \\le m \\\\ 0 < j < n}}^{N} \\prod_{k=1}^{K} x_{ijk}',
  'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}',
  '\\begin{aligned} a &= b + c \\\\ d &= e \\end{aligned}',
  '\\begin{array}{|c|c|} \\hline 1 & 2 \\\\ \\hline \\end{array}',
  '\\mathbb{R} \\mathcal{L} \\mathfrak{g} \\mathbf{v} \\mathsf{A} \\mathtt{t} \\boldsymbol{\\alpha}',
  '\\operatorname{sinc}(x) + \\lim_{x \\to 0} \\frac{\\sin x}{x}',
  '\\hat{x} \\vec{v} \\dot{a} \\bar{x} \\tilde{y} \\widehat{abc} \\overline{AB} \\underline{x}',
  '\\overbrace{a+b}^{n} \\underbrace{c+d}_{m} \\xrightarrow[below]{above}',
  '\\binom{n}{k} \\dfrac{1}{2} \\sqrt[3]{x} \\left\\langle x \\right\\rangle \\lVert x \\rVert',
  '\\Biggl( \\bigl[ x \\bigr] \\Biggr) \\left\\{ \\frac{a}{b} \\middle| c \\right.',
  '\\color{red}{x} + \\textcolor{blue}{y} \\cancel{z} \\boxed{w}',
  '\\text{Текст и } x',
  '\\text{日本} x',
];

const ELEMENT = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/gu;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/gu;
const unescape = (text: string) =>
  text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/gu, '&');

/** KaTeX's MathML markup as a math tree, without a DOM. */
export function parseMathMarkup(markup: string): MathTree {
  const root: { children: (MathTree | string)[] } = { children: [] };
  const open: { tag: string; attrs: Record<string, string>; children: (MathTree | string)[] }[] =
    [];
  const top = () => open.at(-1) ?? root;
  for (const [, closing, tag, attrs, selfClosing, text] of markup.matchAll(ELEMENT)) {
    if (text !== undefined) {
      if (open.length) top().children.push(unescape(text));
    } else if (closing) {
      open.pop();
    } else if (tag) {
      const element = {
        tag,
        attrs: Object.fromEntries(
          [...(attrs ?? '').matchAll(ATTRIBUTE)].map(([, name, value]) => [
            name,
            unescape(value ?? ''),
          ]),
        ),
        children: [] as (MathTree | string)[],
      };
      top().children.push(element);
      if (!selfClosing) open.push(element);
    }
  }
  const math = root.children.find((child): child is MathTree => typeof child !== 'string');
  if (!math) throw new Error('no math');
  return math;
}

/** A source typeset by KaTeX, as the editor's math renderer gives it. */
export function katexTree(source: string, display: boolean): MathTree {
  const tree = parseMathMarkup(
    katex.renderToString(source, {
      displayMode: display,
      output: 'mathml',
      throwOnError: true,
      trust: false,
      strict: 'ignore',
    }),
  );
  return tree.tag === 'math'
    ? tree
    : (tree.children.find((child) => typeof child !== 'string') as MathTree);
}

/** Every source inline and displayed. */
export function mathCases(): { source: string; display: boolean; tree: MathTree }[] {
  return MATH_SOURCES.flatMap((source) =>
    [false, true].map((display) => ({ source, display, tree: katexTree(source, display) })),
  );
}

/** FNV-1a over every layout at 16 px: its box and its drawing. */
export async function fingerprintLayouts(layouter: MathLayouter): Promise<string> {
  const cases = mathCases();
  await layouter.prepare(cases.map(({ tree }) => tree));
  let hash = 0x811c9dc5;
  for (const { tree, display } of cases) {
    const text = JSON.stringify(layouter.layout(tree, display, 16));
    for (let index = 0; index < text.length; index += 1)
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
