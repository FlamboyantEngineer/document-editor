// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addNumberedList,
  addNumberingScope,
  createWordNumbering,
  numberingProperties,
  restartParagraphs,
  writeNumberingPart,
} from './numbering.js';
import { bulletLevels, headingLevels, numberLevels, paragraphLevels } from './numbering-levels.js';

describe('Word numbering levels', () => {
  it('DOCE-FORMAT-5.5 numbers each heading level with the levels above it', () => {
    const levels = headingLevels({
      heading1: { numbering: { format: 'I.' } },
      heading2: { numbering: { format: 'I.1', prefix: 'Part ' } },
      heading3: { numbering: { format: 'I.1.a)' } },
    });
    expect(levels.slice(0, 4)).toEqual([
      { format: 'upperRoman', text: '%1.' },
      { format: 'decimal', text: 'Part %1.%2' },
      { format: 'lowerLetter', text: '%1.%2.%3)' },
      { format: 'none', text: '' },
    ]);
  });

  it('DOCE-FORMAT-5.5 numbers paragraph levels with their indentation', () => {
    const levels = paragraphLevels({
      paragraph: {
        numbering: {
          format: '1.',
          levels: [null, { format: 'a)', numberIndent: '0pt', textIndent: '12pt' }],
        },
      },
    });
    expect(levels[0]).toMatchObject({ format: 'decimal', text: '%1.' });
    expect(levels[1]).toEqual({
      format: 'lowerLetter',
      text: '%2)',
      indent: { left: 240, hanging: 240 },
    });
    expect(
      paragraphLevels({ paragraph: { numbering: { enabled: false, format: '1.' } } })[0],
    ).toMatchObject({
      format: 'none',
    });
  });

  it('DOCE-FORMAT-5.5 writes list bullets and numbers from the list settings', () => {
    expect(bulletLevels({ bullet: 'square', indentation: '24pt' })[1]).toEqual({
      format: 'bullet',
      text: '▪',
      indent: { left: 960, hanging: 360 },
    });
    expect(bulletLevels({ bullet: '–' })[0]?.text).toBe('–');
    expect(numberLevels({ format: 'a)', prefix: '(' })[2]).toMatchObject({
      format: 'lowerLetter',
      text: '(%3)',
    });
  });
});

describe('Word numbering part', () => {
  it('DOCE-FORMAT-5.5 names each definition and gives runs that count on their own a number', () => {
    const numbering = createWordNumbering();
    const scope = addNumberingScope(numbering, { heading1: { numbering: { format: '1.' } } });
    const first = scope.paragraphs;
    restartParagraphs(numbering, scope);
    expect(scope.paragraphs).not.toBe(first);
    const list = addNumberedList(numbering, scope, { start: 4, level: 0 });
    const part = writeNumberingPart(numbering);
    for (const kind of ['Headings', 'Paragraphs', 'Bullets', 'Numbers']) {
      expect(part).toContain(`<w:name w:val="${kind}"/>`);
    }
    expect(part).toContain(
      `<w:num w:numId="${String(list)}"><w:abstractNumId w:val="3"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/>`,
    );
    expect(part.indexOf('<w:num ')).toBeGreaterThan(part.lastIndexOf('</w:abstractNum>'));
    expect(numberingProperties(list, 2)).toBe(
      `<w:numPr><w:ilvl w:val="2"/><w:numId w:val="${String(list)}"/></w:numPr>`,
    );
  });
});
