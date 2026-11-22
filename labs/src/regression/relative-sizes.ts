// The `relativeSizes` query: the document's template with a 150% paragraph at a line height of 1.5, every heading's size
// unset and every caption's fonts unset, so a browser test sees relative sizes and caption
// fallbacks drawn as the text layout engine resolves them, against the paragraph's size.

import type { TemplateFile, TemplateStyles } from '../../../src/model/index.js';

const HEADINGS = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'] as const;
const CAPTIONED = ['table', 'figure', 'codeBlock'] as const;

/** Whether the page asks for the template with relative sizes. */
export const RELATIVE_SIZES = new URLSearchParams(window.location.search).has('relativeSizes');

/** A template with a 150% paragraph and its headings' sizes and captions' fonts unset. */
export function withRelativeSizes(template: TemplateFile): TemplateFile {
  const styles: TemplateStyles = { ...template.styles };
  styles.paragraph = { ...styles.paragraph, size: '150%', lineHeight: 1.5 };
  for (const key of HEADINGS) styles[key] = { ...styles[key], size: null };
  for (const key of CAPTIONED) {
    const object = styles[key];
    if (object?.caption)
      styles[key] = { ...object, caption: { ...object.caption, label: null, text: null } };
  }
  return { ...template, styles };
}
