// The regression documents the pagination scenario labs lay out, taken from the library's
// regression set (`test/fixtures/documents/`), each with its template resolved through the set's
// templates on top of the base template.

import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  type DocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../../../src/model/index.js';
import blockquotes from '../../../test/fixtures/documents/blockquotes.json' with { type: 'json' };
import codeBlocks from '../../../test/fixtures/documents/code-blocks.json' with { type: 'json' };
import emptySections from '../../../test/fixtures/documents/empty-sections.json' with { type: 'json' };
import footnoteHeavy from '../../../test/fixtures/documents/footnote-heavy.json' with { type: 'json' };
import footnotesInStructures from '../../../test/fixtures/documents/footnotes-in-structures.json' with { type: 'json' };
import headingKeepWithNext from '../../../test/fixtures/documents/heading-keep-with-next.json' with { type: 'json' };
import longBulletList from '../../../test/fixtures/documents/long-bullet-list-with-nesting.json' with { type: 'json' };
import longMixed from '../../../test/fixtures/documents/long-mixed.json' with { type: 'json' };
import longOrderedList from '../../../test/fixtures/documents/long-ordered-list.json' with { type: 'json' };
import mixedGeometry from '../../../test/fixtures/documents/mixed-geometry.json' with { type: 'json' };
import mixedGeometryRepeated from '../../../test/fixtures/documents/mixed-geometry-repeated-sections.json' with { type: 'json' };
import nestedLists from '../../../test/fixtures/documents/nested-lists.json' with { type: 'json' };
import oversizedBlocks from '../../../test/fixtures/documents/oversized-blocks.json' with { type: 'json' };
import pageBreaksAndRules from '../../../test/fixtures/documents/page-breaks-and-rules.json' with { type: 'json' };
import romanAndAlpha from '../../../test/fixtures/documents/roman-and-alpha-numbering.json' with { type: 'json' };
import romanStress from '../../../test/fixtures/documents/roman-numbering-stress.json' with { type: 'json' };
import tableBothHeaderModes from '../../../test/fixtures/documents/table-both-header-modes.json' with { type: 'json' };
import tableLongHeaderless from '../../../test/fixtures/documents/table-long-headerless.json' with { type: 'json' };
import tableLongRepeated from '../../../test/fixtures/documents/table-long-repeated-header.json' with { type: 'json' };
import tableLongSingle from '../../../test/fixtures/documents/table-long-single-header.json' with { type: 'json' };
import tableMergedCells from '../../../test/fixtures/documents/table-merged-cells.json' with { type: 'json' };
import tableRichCells from '../../../test/fixtures/documents/table-rich-cells.json' with { type: 'json' };
import regressionBase from '../../../test/fixtures/documents/templates/regression-base.json' with { type: 'json' };
import regressionFootnotes from '../../../test/fixtures/documents/templates/regression-footnotes.json' with { type: 'json' };
import regressionLocked from '../../../test/fixtures/documents/templates/regression-locked.json' with { type: 'json' };
import regressionMixedGeometry from '../../../test/fixtures/documents/templates/regression-mixed-geometry.json' with { type: 'json' };
import regressionNumbering from '../../../test/fixtures/documents/templates/regression-numbering.json' with { type: 'json' };
import regressionTables from '../../../test/fixtures/documents/templates/regression-tables.json' with { type: 'json' };

/** The regression documents the labs show, by their name in the set. */
export const REGRESSION_DOCUMENTS = {
  blockquotes,
  'code-blocks': codeBlocks,
  'empty-sections': emptySections,
  'footnote-heavy': footnoteHeavy,
  'footnotes-in-structures': footnotesInStructures,
  'heading-keep-with-next': headingKeepWithNext,
  'long-bullet-list-with-nesting': longBulletList,
  'long-mixed': longMixed,
  'long-ordered-list': longOrderedList,
  'mixed-geometry': mixedGeometry,
  'mixed-geometry-repeated-sections': mixedGeometryRepeated,
  'nested-lists': nestedLists,
  'oversized-blocks': oversizedBlocks,
  'page-breaks-and-rules': pageBreaksAndRules,
  'roman-and-alpha-numbering': romanAndAlpha,
  'roman-numbering-stress': romanStress,
  'table-both-header-modes': tableBothHeaderModes,
  'table-long-headerless': tableLongHeaderless,
  'table-long-repeated-header': tableLongRepeated,
  'table-long-single-header': tableLongSingle,
  'table-merged-cells': tableMergedCells,
  'table-rich-cells': tableRichCells,
} as const satisfies Record<string, unknown>;

/** A regression document's name in the set. */
export type RegressionDocumentName = keyof typeof REGRESSION_DOCUMENTS;

const TEMPLATES = new Map<string, unknown>([
  [BASE_TEMPLATE_ID, BASE_TEMPLATE],
  ...[
    regressionBase,
    regressionFootnotes,
    regressionLocked,
    regressionMixedGeometry,
    regressionNumbering,
    regressionTables,
  ].map((template) => [template.id, template] as const),
]);

/** A regression document and its resolved template. */
export function regressionDocument(name: RegressionDocumentName): {
  file: DocumentFile;
  template: TemplateFile;
} {
  const file = REGRESSION_DOCUMENTS[name] as unknown as DocumentFile;
  const own = TEMPLATES.get(file.template ?? BASE_TEMPLATE_ID) as TemplateFile;
  const template = resolveTemplateFile(own, {
    loadTemplate: (id) => TEMPLATES.get(id) ?? null,
    baseTemplateId: BASE_TEMPLATE_ID,
  });
  return { file, template };
}
