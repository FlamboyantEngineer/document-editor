// A card of a section of the template editor: its style's rows, then its settings, in a card that
// opens or under a heading in the section.

import { PropertyCard, PropertyGroup } from '@flamboyantengineer/ui-components/property-panel';
import { memo } from 'react';
import { isSameRows } from './same-rows.js';
import { rows } from './setting-row.js';
import { styleSummary } from './style-fields.js';
import { styleKeys, StyleRows } from './style-rows.js';
import type { Rows } from './template-rows.js';
import { settingAt, type TemplateSettingCard } from './template-settings.js';

interface SettingCardProps {
  readonly context: Rows;
  readonly scope: readonly string[];
  readonly card: TemplateSettingCard;
  /** The target's own settings at the card, and those it inherits, for `isSameRows`. */
  readonly own: unknown;
  readonly inherited: unknown;
}

/**
 * A card of a section: its style's rows, then its settings. It renders again only when what it
 * shows changes, as a template has several hundred settings.
 */
export const SettingCard = memo(
  function SettingCard({ context, scope, card }: SettingCardProps) {
    const path = [...scope, ...card.path];
    const style = { context, path };
    const keys = [
      ...styleKeys(card.style ?? []),
      ...(card.settings ?? []).map((each) => each.path),
    ];
    const isOverridden = keys.some(
      (key) => settingAt(context.target.own, [...path, ...key]) !== undefined,
    );
    const content = (
      <>
        {card.style ? <StyleRows scope={style} parts={card.style} code={card.code} /> : null}
        {rows(context, path, card.settings ?? [])}
      </>
    );
    if (card.inline) return <PropertyGroup heading={card.title}>{content}</PropertyGroup>;
    return (
      <PropertyCard
        name={card.title}
        summary={card.style?.includes('font') ? styleSummary(style) : undefined}
        isOverridden={isOverridden}
      >
        {content}
      </PropertyCard>
    );
  },
  (before, after) => before.card === after.card && isSameRows(before, after),
);
