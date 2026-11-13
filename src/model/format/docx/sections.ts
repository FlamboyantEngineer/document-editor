// A document's sections as Word's: each stored section takes its template section's page, size,
// orientation and margins over the template's, and its page header and footer, its own over its
// template section's over the template's. Word ends each section but the last with section
// properties in its last paragraph, and the last with those of the body.

import { PAGE_SIZE_DIMENSIONS } from '../../templates/template-css-values.js';
import { findTemplateSection } from '../../templates/template-sections.js';
import type { StoredContent, StoredSection } from '../document-format.js';
import type {
  PageSettings,
  RegionSettings,
  TemplateFile,
  TemplateSection,
} from '../template-format.js';
import { mergeTemplateSettings, resolveSectionRegion } from '../template-format-resolve.js';
import { toTwips } from './word-xml.js';

/** What a stored section is written with: its template section, page and regions. */
export interface SectionScope {
  readonly templateSection: TemplateSection | null;
  readonly page: PageSettings;
  readonly header: StoredContent;
  readonly footer: StoredContent;
}

/** The relationship ids of a section's header and footer parts, when it has them. */
export interface SectionParts {
  readonly header?: string | undefined;
  readonly footer?: string | undefined;
}

const A4 = { width: '210mm', height: '297mm' };

// A region: the template section's over the template's, then the stored section's own over that.
function regionOf(
  template: TemplateFile,
  sections: { scope: TemplateSection | null; own: StoredSection },
  region: 'header' | 'footer',
): StoredContent {
  const inherited = resolveSectionRegion(template, sections.scope, region);
  const own: RegionSettings | null | undefined = sections.own[region];
  const resolved = resolveSectionRegion({ [region]: inherited }, { [region]: own }, region);
  return resolved?.content ?? [];
}

/** What a stored section is written with, from its resolved template. */
export function resolveSectionScope(template: TemplateFile, section: StoredSection): SectionScope {
  const templateSection = findTemplateSection(template, section.name);
  return {
    templateSection,
    page: mergeTemplateSettings<PageSettings>(template.page ?? {}, templateSection?.page),
    header: regionOf(template, { scope: templateSection, own: section }, 'header'),
    footer: regionOf(template, { scope: templateSection, own: section }, 'footer'),
  };
}

/** A section's properties: its regions' parts, its page size, orientation and margins. */
export function sectionProperties(page: PageSettings, parts: SectionParts = {}): string {
  const size = PAGE_SIZE_DIMENSIONS[page.size ?? 'A4'] ?? A4;
  const landscape = page.orientation === 'landscape';
  const across = toTwips(size.width) ?? 11906;
  const down = toTwips(size.height) ?? 16838;
  const width = landscape ? down : across;
  const height = landscape ? across : down;
  const margin = (side: 'top' | 'right' | 'bottom' | 'left') =>
    String(toTwips(page.margins?.[side]) ?? 1440);
  return [
    '<w:sectPr>',
    parts.header ? `<w:headerReference w:type="default" r:id="${parts.header}"/>` : '',
    parts.footer ? `<w:footerReference w:type="default" r:id="${parts.footer}"/>` : '',
    `<w:pgSz w:w="${String(width)}" w:h="${String(height)}"${landscape ? ' w:orient="landscape"' : ''}/>`,
    `<w:pgMar w:top="${margin('top')}" w:right="${margin('right')}" w:bottom="${margin('bottom')}" w:left="${margin('left')}" w:header="720" w:footer="720" w:gutter="0"/>`,
    '</w:sectPr>',
  ].join('');
}

/**
 * The body's paragraphs with a section's properties in its last paragraph, as Word ends every
 * section but the last; a section that ends in a table or holds nothing gets an empty paragraph.
 */
export function endSection(body: string, properties: string): string {
  const last = body.lastIndexOf('<w:p>');
  const closes = body.endsWith('</w:p>') && last >= 0 && !body.slice(last).includes('<w:tbl>');
  if (!closes) return `${body}<w:p><w:pPr>${properties}</w:pPr></w:p>`;
  const paragraph = body.slice(last);
  const withProperties = paragraph.startsWith('<w:p><w:pPr>')
    ? paragraph.replace(/<\/w:pPr>/, `${properties}</w:pPr>`)
    : paragraph.replace('<w:p>', `<w:p><w:pPr>${properties}</w:pPr>`);
  return body.slice(0, last) + withProperties;
}
