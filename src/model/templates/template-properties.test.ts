import { describe, expect, it } from 'vitest';
import {
  BASE_TEMPLATE,
  resolveTemplateFile,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../index.js';

const A4_WIDTH = (210 * 96) / 25.4;
const A4_HEIGHT = (297 * 96) / 25.4;
const MARGIN = (25.4 * 96) / 25.4;

const compact: TemplateFile = {
  ...BASE_TEMPLATE,
  id: 'compact',
  page: { size: 'US Letter', orientation: 'landscape', margins: { top: '0.5in', bottom: '1in' } },
  styles: {
    ...BASE_TEMPLATE.styles,
    heading1: { ...BASE_TEMPLATE.styles?.heading1, numbering: { format: 'A.', prefix: '' } },
    heading2: { ...BASE_TEMPLATE.styles?.heading2, numbering: { format: '' } },
  },
};

describe('template properties', () => {
  it('DOCE-TEMPLATES-5.1 measures a scope page in pixels, turned for landscape', () => {
    const base = templatePageMetrics(BASE_TEMPLATE);
    expect(base.width).toBeCloseTo(A4_WIDTH);
    expect(base.height).toBeCloseTo(A4_HEIGHT);
    expect(base.margins.left).toBeCloseTo(MARGIN);
    const letter = templatePageMetrics(compact);
    expect(letter).toMatchObject({ width: 1056, height: 816 });
    expect(letter.margins).toMatchObject({ top: 48, bottom: 96 });
    const section = templatePageMetrics(BASE_TEMPLATE, {
      name: 'wide',
      page: { orientation: 'landscape' },
    });
    expect(section.width).toBeCloseTo(A4_HEIGHT);
  });

  it('DOCE-TEMPLATES-5.2 writes the page, text styles, lists and tables as custom properties', () => {
    const properties = templateProperties(BASE_TEMPLATE, { fontStacks: { Arial: 'Lab Sans' } });
    expect(properties['--doc-page-height']).toBe(`${String(A4_HEIGHT)}px`);
    expect(properties['--doc-paragraph-font-family']).toBe('Lab Sans');
    expect(properties['--doc-paragraph-font-size']).toBe('12px');
    expect(properties['--doc-paragraph-line-height']).toBe('1.5');
    expect(properties['--doc-heading-1-font-weight']).toBe('700');
    expect(properties['--doc-heading-1-margin-top']).toBe('16pt');
    expect(properties['--doc-code-font-family']).toBe('"Courier New"');
    expect(properties['--doc-ul-list-style-type']).toBe('disc');
    expect(properties['--doc-ol-counter-content']).toBe('counter(ordered-list, decimal) "." " "');
    expect(properties['--doc-table-header-background']).toBe('#e2e8f0');
    expect(properties['--doc-footnote-numbering-suffix']).toBe('"."');
    expect(properties['--doc-figure-caption-order']).toBe('1');
  });

  it('DOCE-TEMPLATES-5.3 writes numbering as counter content and restarts objects by heading', () => {
    const base = templateProperties(BASE_TEMPLATE);
    expect(base['--doc-heading-2-counter-content']).toBe(
      'counter(h1, decimal) "." counter(h2, decimal) "." " "',
    );
    expect(base['--doc-heading-4-numbering-enabled']).toBe('0');
    expect(base['--doc-table-counter-content']).toContain('"Table "');
    expect(base['--doc-h1-counter-set-extra']).toBe('figure 0 table 0 codeblock 0 equation 0');
    expect(base['--doc-h2-counter-set-extra']).toBeUndefined();
    expect(base['--doc-equation-counter-content']).toMatch(/^"\(Eq\. " .* "\)" " "$/);
    const letters = templateProperties(compact);
    expect(letters['--doc-heading-1-counter-content']).toBe('counter(h1, upper-alpha) "." " "');
    expect(letters['--doc-heading-2-numbering-enabled']).toBe('0');
  });

  it('DOCE-TEMPLATES-5.4 reads a section scope over the template', () => {
    const section = {
      name: 'appendix',
      styles: { paragraph: { size: '10px' } },
      footnotes: { suffix: ')' },
    };
    const properties = templateProperties(BASE_TEMPLATE, { section });
    expect(properties['--doc-paragraph-font-size']).toBe('10px');
    expect(properties['--doc-paragraph-line-height']).toBe('1.5');
    expect(properties['--doc-footnote-numbering-suffix']).toBe('")"');
  });

  it('DOCE-TEMPLATES-5.7 sets only what a root template sets', () => {
    const article = resolveTemplateFile(
      {
        formatVersion: 1,
        id: 'article',
        page: { size: 'A4', margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
        styles: { heading1: { size: '22px', numbering: { format: '' } } },
      },
      { loadTemplate: () => BASE_TEMPLATE, baseTemplateId: null },
    );
    const properties = templateProperties(article);
    expect(properties['--doc-page-margin-left']).toBe('24px');
    expect(properties['--doc-heading-1-font-size']).toBe('22px');
    expect(properties['--doc-heading-1-numbering-enabled']).toBe('0');
    expect(properties['--doc-heading-2-numbering-enabled']).toBe('0');
    expect(properties['--doc-paragraph-font-family']).toBeUndefined();
  });

  it('DOCE-TEMPLATES-5.8 DOCE-TEMPLATES-5.9 writes the change bars, a disabled kind transparent, on their side', () => {
    const properties = templateProperties(BASE_TEMPLATE);
    expect(properties).toMatchObject({
      '--doc-change-bar-insertions-color': '#00dd00',
      '--doc-change-bar-deletions-color': '#dd0000',
      '--doc-change-bar-modifications-color': '#0000dd',
      '--doc-change-bar-formatting-color': '#dd00dd',
      '--doc-change-bar-width': '5px',
      '--doc-change-bar-left': 'calc(-1 * (10px + 5px))',
      '--doc-change-bar-right': 'auto',
    });
    const right = templateProperties({
      formatVersion: 1,
      id: 'right',
      changeBars: { side: 'right', insertions: { enabled: false, color: '#00dd00' } },
    });
    expect(right['--doc-change-bar-insertions-color']).toBe('transparent');
    expect(right['--doc-change-bar-left']).toBe('auto');
    expect(right['--doc-change-bar-right']).toBe('calc(-1 * (8px + 4px))');
    expect(templateProperties(BASE_TEMPLATE, { section: { name: 'appendix' } })).not.toHaveProperty(
      '--doc-change-bar-width',
    );
    // DOCE-TEMPLATES-5.9: a section with change bars of its own sets them over the document's.
    const annex = templateProperties(BASE_TEMPLATE, {
      section: { name: 'annex', changeBars: { side: 'right' } },
    });
    expect(annex).toMatchObject({
      '--doc-change-bar-left': 'auto',
      '--doc-change-bar-right': 'calc(-1 * (10px + 5px))',
      '--doc-change-bar-insertions-color': '#00dd00',
    });
  });

  it('DOCE-NUMBERING-2.6 reads switched-off numbering as an empty format, keeping the format', () => {
    const off = { enabled: false } as const;
    const properties = templateProperties({
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        heading1: { numbering: { ...BASE_TEMPLATE.styles?.heading1?.numbering, ...off } },
        paragraph: { numbering: { ...BASE_TEMPLATE.styles?.paragraph?.numbering, ...off } },
        table: { numbering: { ...BASE_TEMPLATE.styles?.table?.numbering, ...off } },
      },
    });
    expect(properties['--doc-heading-1-numbering-enabled']).toBe('0');
    expect(properties['--doc-paragraph-numbering-enabled']).toBe('0');
    const blank = templateProperties({
      ...BASE_TEMPLATE,
      styles: { ...BASE_TEMPLATE.styles, table: { numbering: { prefix: 'Table ', format: '' } } },
    });
    expect(properties['--doc-table-counter-content']).toBe(blank['--doc-table-counter-content']);
    expect(properties['--doc-heading-2-numbering-enabled']).toBe('1');
  });

  it('DOCE-TEMPLATES-10.2 writes a bullet keyword as a list style and other text as a string', () => {
    const list = (bullet: string) =>
      templateProperties({ formatVersion: 1, id: 'list', styles: { list: { bullet } } })[
        '--doc-ul-list-style-type'
      ];
    expect(list('square')).toBe('square');
    expect(list('–')).toBe('"– "');
    expect(list('"</style>')).toBe('"\\"\\3C /style\\3E  "');
  });

  it('DOCE-TEMPLATES-10.5 writes leaders, their spacing and list number affixes', () => {
    const properties = templateProperties({
      formatVersion: 1,
      id: 'lists',
      styles: {
        list: { format: 'a)', prefix: '(', suffix: ':' },
        contents: {
          leader: { character: '_', spacing: '2pt' },
          levels: [null, { indentation: '12pt', leader: { spacing: '4pt' } }],
        },
      },
    });
    expect(properties).toMatchObject({
      '--doc-ol-list-style-type': 'lower-alpha',
      '--doc-ol-counter-content': '"(" counter(ordered-list, lower-alpha) ")" ":" " "',
      '--doc-contents-leader': '"_"',
      '--doc-contents-leader-spacing': '2pt',
      '--doc-contents-level-2-indentation': '12pt',
      '--doc-contents-level-2-leader-spacing': '4pt',
    });
    expect(properties).not.toHaveProperty('--doc-contents-level-1-leader-spacing');
    const prefixOnly = templateProperties({
      formatVersion: 1,
      id: 'prefix',
      styles: { list: { prefix: '#' } },
    });
    expect(prefixOnly['--doc-ol-counter-content']).toBe(
      '"#" counter(ordered-list, decimal) "." " "',
    );
  });
});
