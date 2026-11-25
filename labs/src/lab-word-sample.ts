// The import and export lab's sample word processing document, built in the page as a word
// processor writes one (`buildDocx`): a title, a heading and text, a table wider than the page
// with a caption typed as plain text before it, an image with a plain-text caption after it, and an
// appendix headed `Appendix A`. The text is neutral sample text.

import {
  A4,
  buildDocx,
  paragraph,
  run,
  style,
} from '../../test/fixtures/docx/build-docx-fixture.js';

// A small blue picture, as a PNG file's bytes.
const PICTURE =
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAYCAIAAAAzn+mLAAAALElEQVR42u3OAQkAAAgDsJcxmfEtYQ3BwQIs1XNKhISEhISEhISEhISEfoUWjWaF2wHyaRIAAAAASUVORK5CYII=';

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const styleDef = (id: string, name: string, extra = '') =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;

const drawing = (id: string, name: string) =>
  `<w:r><w:drawing><wp:inline><wp:extent cx="1828800" cy="914400"/><wp:docPr id="1" name="${name}" descr="${name}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

const cell = (text: string) => `<w:tc><w:p>${run(text)}</w:p></w:tc>`;

// A two-column table 9000 twentieths of a point wide each, far wider than an A4 page's text.
const WIDE_TABLE = [
  '<w:tbl><w:tblGrid><w:gridCol w:w="9000"/><w:gridCol w:w="9000"/></w:tblGrid>',
  `<w:tr>${cell('Pump')}${cell('Flow')}</w:tr>`,
  `<w:tr>${cell('North')}${cell('12 litres a second')}</w:tr>`,
  `<w:tr>${cell('South')}${cell('9 litres a second')}</w:tr>`,
  '</w:tbl>',
].join('');

/** The sample document's bytes. */
export function sampleWordDocument(): Uint8Array {
  return buildDocx({
    styles: [
      styleDef('Normal', 'Normal'),
      styleDef('Title', 'Title'),
      styleDef('Heading1', 'heading 1', '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>'),
    ].join(''),
    media: { 'picture.png': bytesOf(PICTURE) },
    body: [
      paragraph(run('Pump station notes'), style('Title')),
      paragraph(run('Scope'), style('Heading1')),
      paragraph(run('The station lifts water to the upper tank.')),
      paragraph(run('Table 1. Pump flows')),
      WIDE_TABLE,
      paragraph(drawing('rIdpicture', 'Station layout')),
      paragraph(run('Figure 1. Station layout')),
      paragraph(run('Appendix A Spare parts'), style('Heading1')),
      paragraph(run('Keep two seals for each pump.')),
      A4,
    ].join(''),
  });
}
