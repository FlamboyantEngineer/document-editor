import { BASE_TEMPLATE } from '../../../../src/model/templates/base-template.js';
import { lengthToCssPx } from '../../../../src/model/templates/template-css-values.js';
import {
  templatePageMetrics,
  templateScopeStyles,
} from '../../../../src/model/templates/template-properties.js';
import { textStyleProperties } from '../../../../src/model/templates/template-text-properties.js';

export const px = (value: number) => `${String(value)}px`;
const length = (value: unknown) => Number.parseFloat(lengthToCssPx(value) ?? '0');

export interface Typography {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly italic: boolean;
  readonly leading: number;
  readonly before: number;
  readonly after: number;
}

export function font(style: Typography): string {
  return `${style.italic ? 'italic ' : ''}${String(style.weight)} ${px(style.size)} ${style.family}`;
}

// This spike resolves one template scope. Both HTML paths receive the same explicit geometry.
const styles = templateScopeStyles(BASE_TEMPLATE, null);
const properties = textStyleProperties(styles);
function type(prefix: string, defaultLeading: number): Typography {
  const property = (key: string) => properties[`--doc-${prefix}-${key}`];
  const size = length(property('font-size'));
  return {
    family: property('font-family') ?? 'Arial',
    size,
    weight: Number(property('font-weight')) || 400,
    italic: property('font-style') === 'italic',
    leading: Math.round(size * (Number(property('line-height')) || defaultLeading)),
    before: length(property('margin-top')),
    after: length(property('margin-bottom')),
  };
}

export const paragraph = type('paragraph', 1.5);
export const headings = Array.from({ length: 6 }, (_, index) =>
  type(`heading-${String(index + 1)}`, 1.2),
);
export const code = type('code', 1.6);
export const listIndent = length(styles.list?.indentation);
export const listBefore = length(styles.list?.spaceBefore);
export const listAfter = length(styles.list?.spaceAfter);
export const cellPadding = length(styles.table?.cellPadding);
export const cellBorder = length(styles.table?.border?.width);
export const codePadding = 8;
export const inlineMath = { width: 76, height: 14 };
export const displayMath = { width: 200, height: 40 };
export const pageGap = 16;
const { width, height, margins } = templatePageMetrics(BASE_TEMPLATE);
export const contentHeight = Math.floor(height - margins.top - margins.bottom);
// Preserve the template's fractional width in the CSS layout units used by Chromium.
const layoutUnitsPerPixel = 64;
const blinkLayoutWidth = (width: number) =>
  Math.floor(width * layoutUnitsPerPixel) / layoutUnitsPerPixel;
export const defaultWidth = blinkLayoutWidth(width - margins.left - margins.right);

// Blink's LineBreaker::AvailableWidthToFit adds one LayoutUnit. The pinned Pretext
// 1.0.0 Blink profile already adds 0.005px internally. Apply the balance only to the
// line-fit decision and keep the actual box width for both pagination and rendering.
const pretextBlinkFitEpsilon = 0.005;
const blink = /(?:Chrome|Chromium)\//u.test(globalThis.navigator?.userAgent ?? '');
export function inlineFitWidth(width: number) {
  return blink ? blinkLayoutWidth(width) + 1 / layoutUnitsPerPixel - pretextBlinkFitEpsilon : width;
}
export const pageHeight = contentHeight + margins.top + margins.bottom;
export const pageWidth = (contentWidth: number) => contentWidth + margins.left + margins.right;

export function applySettings(root: HTMLElement, contentWidth: number) {
  const set = (key: string, value: number) => root.style.setProperty(key, px(value));
  Object.entries(properties).forEach(([key, value]) => root.style.setProperty(key, value));
  set('--doc-page-width', pageWidth(contentWidth));
  set('--doc-page-height', pageHeight);
  set('--pretext-content-width', contentWidth);
  set('--pretext-content-height', contentHeight);
  set('--pretext-code-padding', codePadding);
  set('--pretext-inline-math-width', inlineMath.width);
  set('--pretext-inline-math-height', inlineMath.height);
  set('--pretext-display-math-width', displayMath.width);
  set('--pretext-display-math-height', displayMath.height);
  Object.entries(margins).forEach(([side, value]) => set(`--doc-page-margin-${side}`, value));
  for (const [prefix, style] of [
    ['paragraph', paragraph],
    ['code', code],
    ...headings.map((style, index) => [`heading-${String(index + 1)}`, style] as const),
  ] as const) {
    set(`--doc-${prefix}-line-height`, style.leading);
  }
}
