// The base template: every setting a document needs, which a template inherits for what it does
// not set (DOCE-FORMAT-3.2). A host stores it, or one of its own, as its base template.

import type { HeadingSettings, TemplateFile, TextSettings } from '../format/template-format.js';

function bold(size: string, color: string, space: [string, string]): TextSettings {
  return {
    font: 'Arial',
    size,
    color,
    weight: 700,
    italic: false,
    underline: false,
    alignment: 'left',
    spaceBefore: space[0],
    spaceAfter: space[1],
  };
}

function heading(text: TextSettings, format = ''): HeadingSettings {
  return { ...text, numbering: { format, prefix: '', suffix: '' } };
}

const LEVEL_INDENTS = [
  ['0px', '25px'],
  ['10px', '45px'],
  ['20px', '65px'],
  ['25px', '80px'],
  ['30px', '95px'],
  ['35px', '110px'],
] as const;

const CONTENTS_LEVEL = { indentation: '0pt', spaceBefore: '0pt', spaceAfter: '0pt' };

/** The base template's id. */
export const BASE_TEMPLATE_ID = 'base';

/** The base template. */
export const BASE_TEMPLATE: Readonly<TemplateFile> = Object.freeze<TemplateFile>({
  formatVersion: 1,
  id: BASE_TEMPLATE_ID,
  name: 'Base',
  page: {
    size: 'A4',
    orientation: 'portrait',
    margins: { top: '25.4mm', right: '25.4mm', bottom: '25.4mm', left: '25.4mm' },
  },
  styles: {
    paragraph: {
      font: 'Arial',
      size: '12px',
      color: '#111827',
      lineHeight: 1.5,
      alignment: 'left',
      spaceBefore: '0pt',
      spaceAfter: '6pt',
      weight: 400,
      italic: false,
      underline: false,
      numbering: {
        enabled: false,
        format: '1.',
        prefix: '',
        suffix: '',
        levels: LEVEL_INDENTS.map(([numberIndent, textIndent], index) => ({
          format: '1.'.repeat(index + 1),
          numberIndent,
          textIndent,
        })),
      },
    },
    title: bold('24px', '#111827', ['0pt', '12pt']),
    heading1: heading(bold('22px', '#111827', ['16pt', '8pt']), '1.'),
    heading2: heading(bold('20px', '#1f2937', ['14pt', '7pt']), '1.1.'),
    heading3: heading(bold('18px', '#374151', ['12pt', '6pt']), '1.1.1.'),
    heading4: heading(bold('16px', '#374151', ['10pt', '5pt'])),
    heading5: heading(bold('14px', '#475569', ['8pt', '4pt'])),
    heading6: heading(bold('12px', '#475569', ['6pt', '3pt'])),
    list: {
      bullet: 'disc',
      format: '1.',
      indentation: '24pt',
      spaceBefore: '0pt',
      spaceAfter: '6pt',
    },
    table: {
      numbering: { format: '1.1.', prefix: 'Table ', suffix: '' },
      caption: { placement: 'above', alignment: 'left', continuedSuffix: '' },
      border: { width: '1px', color: '#334155' },
      cellPadding: '8px',
      header: { background: '#e2e8f0', color: '#0f172a', weight: 700 },
      rows: { odd: '#ffffff', even: '#f8fafc' },
      repeatHeader: true,
    },
    figure: {
      numbering: { format: '1.1.', prefix: 'Figure ', suffix: '' },
      caption: { placement: 'below', continuedSuffix: '' },
      defaultWidth: '240px',
    },
    codeBlock: {
      font: 'Courier New',
      size: '10px',
      color: '#0f172a',
      background: '#f8fafc',
      spaceBefore: '8pt',
      spaceAfter: '8pt',
      numbering: { format: '1.1.', prefix: '', suffix: '' },
      caption: { placement: 'above', continuedSuffix: '(continued)' },
    },
    equation: { numbering: { format: '1.1.', prefix: '(Eq. ', suffix: ')' } },
    contents: {
      title: { weight: 700, color: '#0f172a' },
      entry: { weight: 400 },
      padding: { left: '0pt', right: '0pt' },
      spacing: { top: '0pt', bottom: '0pt' },
      leader: { character: '.' },
      levels: LEVEL_INDENTS.map(() => CONTENTS_LEVEL),
    },
  },
  header: { content: [] },
  footer: { content: [] },
  footnotes: {
    numbering: 'document',
    suffix: '.',
    separator: { enabled: true, thickness: '1px', color: '#111827' },
    spacingToContent: '12pt',
    entrySpacing: '6pt',
    marker: { font: 'Arial', size: '10px', weight: 600, italic: false, color: '#111827' },
    text: {
      font: 'Arial',
      size: '10px',
      weight: 400,
      italic: false,
      color: '#111827',
      lineHeight: 1.4,
      alignment: 'left',
    },
  },
  changeBars: {
    insertions: { enabled: true, color: '#00dd00' },
    deletions: { enabled: true, color: '#dd0000' },
    modifications: { enabled: true, color: '#0000dd' },
    formatting: { enabled: true, color: '#dd00dd' },
    side: 'left',
    offset: '10px',
    width: '5px',
  },
});
