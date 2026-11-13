// The footnotes part and the document settings that number footnotes: through the document, or
// from 1 on each page, as the template numbers them.

import type { FootnoteSettings } from '../template-format.js';
import { escapeXml, WORD_NAMESPACES, XML_DECLARATION } from './word-xml.js';

/** The footnotes part: Word's separators, then each footnote's runs after its number. */
export function writeFootnotesPart(footnotes: readonly string[]): string {
  const separator = (id: string, type: string) =>
    `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:r><w:${type}/></w:r></w:p></w:footnote>`;
  return [
    XML_DECLARATION,
    `<w:footnotes ${WORD_NAMESPACES}>`,
    separator('-1', 'separator'),
    separator('0', 'continuationSeparator'),
    ...footnotes.map(
      (runs, index) =>
        `<w:footnote w:id="${String(index + 1)}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${runs}</w:p></w:footnote>`,
    ),
    '</w:footnotes>',
  ].join('');
}

/**
 * The settings part: how footnotes are numbered, and the template section each section is, in
 * order, so that a reader places them again (an empty name for a section outside them).
 */
export function writeSettingsPart(
  footnotes: FootnoteSettings | null | undefined,
  sections: readonly string[],
): string {
  const restart = footnotes?.numbering === 'page' ? '<w:numRestart w:val="eachPage"/>' : '';
  return [
    XML_DECLARATION,
    `<w:settings ${WORD_NAMESPACES}>`,
    '<w:defaultTabStop w:val="720"/>',
    `<w:footnotePr>${restart}<w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>`,
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>',
    `<w:docVars><w:docVar w:name="sections" w:val="${escapeXml(JSON.stringify(sections))}"/></w:docVars>`,
    '</w:settings>',
  ].join('');
}
