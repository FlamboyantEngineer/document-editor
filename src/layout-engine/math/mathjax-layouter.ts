// Equations laid out and drawn by MathJax, the same on every system (DOCE-PAGINATION-12.12): the
// MathML the math renderer typeset goes through MathJax's MathML input and SVG output, with its
// STIX2 glyph data, in MathJax's own DOM-free document (the lite adaptor), so nothing is measured
// by a browser or a system font. Each equation gives its box in CSS pixels and its drawing as an
// SVG tree of paths and rules. MathJax and its STIX2 font are optional peers, loaded with the
// first equation; without them there is no layouter and math takes the reserved box.

import type { MathTree } from '../../engine/math-typeset.js';
import {
  type LaidMath,
  MATH_DRAWING_ATTRIBUTES,
  MATH_DRAWING_ELEMENTS,
  type MathLayouter,
} from '../math-atoms.js';

// The dash patterns MathJax's stylesheet gives a table's dashed and dotted lines, as attributes.
const LINE_STYLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'mjx-dashed': { 'stroke-dasharray': '140' },
  'mjx-dotted': { 'stroke-linecap': 'round', 'stroke-dasharray': '0,140' },
};

// The font's glyph ranges MathJax loads as an equation needs them, as static imports so a bundler
// keeps each as a chunk of its own.
const RANGES: Readonly<Record<string, () => Promise<unknown>>> = {
  'accents-other': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/accents-other.js'),
  accents: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/accents.js'),
  arrows: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/arrows.js'),
  calligraphic: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/calligraphic.js'),
  cyrillic: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/cyrillic.js'),
  dingbats: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/dingbats.js'),
  'double-struck': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/double-struck.js'),
  enclosed: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/enclosed.js'),
  fraktur: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/fraktur.js'),
  greek: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/greek.js'),
  'latin-b': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin-b.js'),
  'latin-bi': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin-bi.js'),
  'latin-i': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin-i.js'),
  latin: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/latin.js'),
  math: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/math.js'),
  monospace: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/monospace.js'),
  phonetics: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/phonetics.js'),
  'sans-serif': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/sans-serif.js'),
  script: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/script.js'),
  shapes: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/shapes.js'),
  stretchy: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/stretchy.js'),
  'symbols-other': () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/symbols-other.js'),
  symbols: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/symbols.js'),
  upright: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/upright.js'),
  variants: () => import('@mathjax/mathjax-stix2-font/js/svg/dynamic/variants.js'),
};

const RANGE_NAME = /\/svg\/dynamic\/([a-z-]+)\.js$/u;

async function loadRange(name: string): Promise<unknown> {
  const load = RANGES[RANGE_NAME.exec(name)?.[1] ?? ''];
  if (!load) throw new Error(`No math glyph range ${name}`);
  const loaded = (await load()) as { default?: unknown };
  return loaded.default ?? loaded;
}

const escapeText = (text: string) =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
const escapeAttribute = (text: string) => escapeText(text).replace(/"/gu, '&quot;');

/** A math tree as MathML markup, MathJax's input. */
export function mathMarkup(tree: MathTree | string): string {
  if (typeof tree === 'string') return escapeText(tree);
  const attrs = Object.entries(tree.attrs)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  return `<${tree.tag}${attrs}>${tree.children.map(mathMarkup).join('')}</${tree.tag}>`;
}

// The subset of MathJax's lite adaptor's nodes the drawing is read from.
interface LiteNode {
  readonly kind: string;
  readonly value?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly children?: readonly LiteNode[];
}

// A lite node as a drawing: the kept elements and attributes, and the text MathJax could not draw.
function drawingOf(node: LiteNode, missing: string[]): MathTree | null {
  if (node.kind === 'text') {
    missing.push(...[...(node.children ?? [])].map((child) => child.value ?? ''));
    return null;
  }
  if (!MATH_DRAWING_ELEMENTS.has(node.kind)) return null;
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attributes ?? {})) {
    if (MATH_DRAWING_ATTRIBUTES.has(name) && typeof value === 'string') attrs[name] = value;
  }
  for (const name of String(node.attributes?.class ?? '').split(/\s+/u))
    Object.assign(attrs, LINE_STYLES[name]);
  // Glyphs reach past the boxes MathJax nests them in, as its stylesheet lets them.
  if (node.kind === 'svg') attrs.overflow = 'visible';
  const children = (node.children ?? []).flatMap((child) => drawingOf(child, missing) ?? []);
  return { tag: node.kind, attrs, children };
}

// The svg element under MathJax's container, and any text it draws for characters with no glyph.
function findSvg(node: LiteNode): LiteNode | null {
  if (node.kind === 'svg') return node;
  for (const child of node.children ?? []) {
    const found = findSvg(child);
    if (found) return found;
  }
  return null;
}

function hasError(node: LiteNode): boolean {
  if (node.kind === 'merror' || node.attributes?.['data-mjx-error'] !== undefined) return true;
  if (node.attributes?.['data-mml-node'] === 'merror') return true;
  return (node.children ?? []).some(hasError);
}

// An equation's layout in ems: its box and drawing, as MathJax gives them at any size.
type EmLayout = LaidMath;

// The box from the drawing's viewBox (`minX minY width height`, in thousandths of an em).
function emLayout(container: LiteNode): EmLayout | null {
  const svg = findSvg(container);
  if (!svg || hasError(container)) return null;
  const box = String(svg.attributes?.viewBox ?? svg.attributes?.['data-mjx-viewBox'] ?? '')
    .trim()
    .split(/\s+/u)
    .map(Number);
  const [, minY, width, height] = box;
  if (box.length !== 4 || [minY, width, height].some((value) => !Number.isFinite(value)))
    return null;
  const missing: string[] = [];
  const drawing = drawingOf(svg, missing);
  if (!drawing) return null;
  const viewBox = box.join(' ');
  return {
    width: (width ?? 0) / 1000,
    ascent: -(minY ?? 0) / 1000,
    descent: ((height ?? 0) + (minY ?? 0)) / 1000,
    svg: { ...drawing, attrs: { viewBox, overflow: 'visible' } },
    missing: missing.join(''),
  };
}

const upTo64th = (length: number) => Math.ceil(length * 64 - 1e-9) / 64;

interface Converter {
  readonly key: string;
  convert(markup: string, display: boolean): LiteNode;
  convertLoading(markup: string, display: boolean): Promise<LiteNode>;
  isRetry(error: unknown): boolean;
}

async function createConverter(): Promise<Converter | null> {
  const modules = await Promise.all([
    import('@mathjax/src/js/mathjax.js'),
    import('@mathjax/src/js/input/mathml.js'),
    import('@mathjax/src/js/output/svg.js'),
    import('@mathjax/src/js/adaptors/liteAdaptor.js'),
    import('@mathjax/src/js/handlers/html.js'),
    import('@mathjax/mathjax-stix2-font/js/svg.js'),
  ]).catch(() => null);
  if (!modules) return null;
  const [{ mathjax }, { MathML }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, font] =
    modules;
  mathjax.asyncLoad = loadRange;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const output = new SVG({
    fontData: font.MathJaxStix2Font,
    fontCache: 'none',
    linebreaks: { inline: false, automatic: false },
  });
  const document = mathjax.document('', { InputJax: new MathML(), OutputJax: output });
  // Sizes are read in ems, so the em and ex given here only set the attributes left out.
  const options = (display: boolean) => ({ display, em: 16, ex: 8, containerWidth: 1_000_000 });
  return {
    key: `mathjax-${mathjax.version}-stix2-${font.MathJaxStix2Font.NAME}`,
    convert: (markup, display) => document.convert(markup, options(display)) as LiteNode,
    convertLoading: async (markup, display) =>
      (await document.convertPromise(markup, options(display))) as LiteNode,
    isRetry: (error) => Boolean((error as { retry?: unknown } | null)?.retry),
  };
}

/** The MathJax layouter, or null when MathJax or its STIX2 font is not installed. */
export async function createMathJaxLayouter(): Promise<MathLayouter | null> {
  const converter = await createConverter();
  if (!converter) return null;
  const laid = new Map<string, EmLayout | null>();
  const cacheKey = (markup: string, display: boolean) => `${display ? 'D' : 'I'}${markup}`;
  const keep = (markup: string, display: boolean, container: LiteNode) => {
    const layout = emLayout(container);
    laid.set(cacheKey(markup, display), layout);
    return layout;
  };
  const tryConvert = (markup: string, display: boolean): EmLayout | null | undefined => {
    const cached = laid.get(cacheKey(markup, display));
    if (cached !== undefined || laid.has(cacheKey(markup, display))) return cached;
    try {
      return keep(markup, display, converter.convert(markup, display));
    } catch (error) {
      if (converter.isRetry(error)) return undefined;
      laid.set(cacheKey(markup, display), null);
      return null;
    }
  };
  return {
    key: converter.key,
    prepare(trees) {
      const waiting = trees.flatMap((tree) => {
        const display = tree.attrs.display === 'block';
        const markup = mathMarkup(tree);
        if (tryConvert(markup, display) !== undefined) return [];
        return [
          converter
            .convertLoading(markup, display)
            .then((container) => keep(markup, display, container))
            .catch(() => laid.set(cacheKey(markup, display), null)),
        ];
      });
      return waiting.length ? Promise.all(waiting).then(() => undefined) : null;
    },
    layout(tree, display, sizePx) {
      const layout = tryConvert(mathMarkup(tree), display);
      if (!layout) return null;
      return {
        width: upTo64th(layout.width * sizePx),
        ascent: upTo64th(layout.ascent * sizePx),
        descent: upTo64th(layout.descent * sizePx),
        svg: layout.svg,
        missing: layout.missing,
      };
    },
  };
}
