// The template editor's text styles, one card each: the title, the headings and the paragraph.

import {
  PropertyCard,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import { memo } from 'react';
import { RUNNING_PARTS } from './object-settings.js';
import { isSameRows, type ShownRows } from './same-rows.js';
import { rows } from './setting-row.js';
import { isStyleOverridden, type StyleScope, styleSummary } from './style-fields.js';
import { NumberingStrip, StyleRows } from './style-rows.js';
import type { Rows } from './template-rows.js';
import { setting, settingAt, type StylePart, TEXT_STYLES } from './template-settings.js';

// A text style's rows: running text's for the paragraph, with its line height; the title's and a
// heading's without one, a heading's with its numbering.
const TEXT_PARTS: readonly StylePart[] = ['font', 'face', 'align', 'colour', 'spacing'];
const partsOf = (id: string): readonly StylePart[] =>
  id === 'paragraph'
    ? RUNNING_PARTS
    : id.startsWith('heading')
      ? [...TEXT_PARTS, 'numbering']
      : TEXT_PARTS;

const INDENTATION = setting('indentation', 'Indentation', { type: 'length' });

// A built-in text style's card. It renders again only when what it shows changes.
const TextStyleCard = memo(
  function TextStyleCard({ context, id, label }: ShownRows & { id: string; label: string }) {
    const scope: StyleScope = { context, path: ['styles', id] };
    return (
      <PropertyCard
        name={label}
        summary={styleSummary(scope)}
        isOverridden={isStyleOverridden(scope)}
      >
        <StyleRows
          scope={scope}
          parts={partsOf(id)}
          numberingElsewhere={context.target.own !== context.props.template}
        />
        {id === 'paragraph' ? rows(context, scope.path, [INDENTATION]) : null}
      </PropertyCard>
    );
  },
  (before, after) => before.id === after.id && isSameRows(before, after),
);

/** The built-in text styles' cards, in the order a document reads them: title, headings, text. */
export function TextStyleSection({ context }: { context: Rows }) {
  const { labels, target } = context;
  return (
    <PropertySection id="text-styles" title={labels.textStyles}>
      {TEXT_STYLES.map(({ id, label }) => (
        <TextStyleCard
          key={id}
          context={context}
          id={id}
          label={label}
          own={settingAt(target.own, ['styles', id])}
          inherited={target.inherited ? settingAt(target.inherited, ['styles', id]) : undefined}
        />
      ))}
    </PropertySection>
  );
}

/**
 * A section's heading numbering: a row for each heading level with the text before its number,
 * its format and the text after; a field emptied inherits the document's again.
 */
export function HeadingNumberingSection({ context }: { context: Rows }) {
  const { labels } = context;
  const headings = TEXT_STYLES.filter(({ id }) => id.startsWith('heading'));
  return (
    <PropertySection id="heading-numbering" title={labels.headingNumbering}>
      {headings.map(({ id, label }) => {
        const scope: StyleScope = { context, path: ['styles', id] };
        const own = settingAt(context.target.own, ['styles', id, 'numbering']);
        return (
          <PropertyRow key={id} label={label} isOverridden={own !== undefined}>
            <NumberingStrip scope={scope} />
          </PropertyRow>
        );
      })}
    </PropertySection>
  );
}
