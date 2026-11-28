import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/format/template-format.js';
import { BASE_TEMPLATE } from '../../model/templates/base-template.js';
import { blockMetrics } from './metrics.js';

// The base template with its paragraph at 16px and some of its lengths in em, as the stylesheet
// draws them: in the font size of the element that takes them.
function inEm(): TemplateFile {
  const styles = BASE_TEMPLATE.styles ?? {};
  return {
    ...BASE_TEMPLATE,
    styles: {
      ...styles,
      paragraph: { ...styles.paragraph, size: '16px', spaceAfter: '0.5em' },
      list: { ...styles.list, indentation: '2em', spaceBefore: '0.25em', spaceAfter: '1em' },
      table: { ...styles.table, cellPadding: '0.5em', border: { width: '0.125em' } },
    },
    footnotes: {
      ...BASE_TEMPLATE.footnotes,
      text: { ...BASE_TEMPLATE.footnotes?.text, size: '10px' },
      spacingToContent: '1em',
      entrySpacing: '0.5em',
      separator: { enabled: true, thickness: '0.2em', color: '#000000' },
    },
  } as TemplateFile;
}

describe('block metrics', () => {
  it('DOCE-PAGINATION-10.9 reads em lengths in the font size the stylesheet draws them in', () => {
    const metrics = blockMetrics(inEm());
    expect(metrics.em).toBe(16);
    expect(metrics.paragraphAfter).toBe(8);
    expect(metrics.list).toEqual({ indent: 32, before: 4, after: 16 });
    expect(metrics.table).toMatchObject({ cellPadding: 8, border: 2 });
    // The footnote area's lengths in its own text size.
    expect(metrics.footnotes).toEqual({ separator: 2, spacing: 10, entrySpacing: 5 });
  });

  it('DOCE-PAGINATION-10.9 reads rem lengths at the root size and falls back for forms the format does not take', () => {
    const styles = BASE_TEMPLATE.styles ?? {};
    const metrics = blockMetrics({
      ...BASE_TEMPLATE,
      styles: {
        ...styles,
        paragraph: { ...styles.paragraph, spaceAfter: '0.5rem' },
        list: { ...styles.list, indentation: '50%', spaceBefore: '-1em' },
      },
    } as TemplateFile);
    expect(metrics.paragraphAfter).toBe(8);
    // A percentage or a negative length is not a template length: the stylesheet is not given it.
    expect(metrics.list.indent).toBe(32);
    expect(metrics.list.before).toBe(0);
  });

  it('DOCE-PAGINATION-10.9 keeps absolute lengths and the defaults', () => {
    const metrics = blockMetrics(BASE_TEMPLATE);
    expect(metrics.em).toBe(12);
    expect(metrics.paragraphAfter).toBe(8);
    expect(metrics.list.indent).toBe(32);
  });
});
