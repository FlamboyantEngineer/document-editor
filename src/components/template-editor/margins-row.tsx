// The page margins as one row of four sides, in millimetres on an A or B size page and in inches
// otherwise. Each side holds the scope's own margin and shows the one it inherits while it has none.

import {
  type BoxSide,
  FourSidePropertyStrip,
} from '@flamboyantengineer/ui-components/four-side-property-strip';
import { useState } from 'react';
import type { Rows } from './template-rows.js';
import { settingAt } from './template-settings.js';

// Millimetres in each unit a margin may be written in.
const MILLIMETRES: Readonly<Record<string, number>> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  px: 25.4 / 96,
};

/** A length in the unit given, rounded to hundredths; null when it is not a length. */
export function lengthIn(value: unknown, unit: 'mm' | 'in'): number | null {
  const match = /^(\d+(?:\.\d+)?)(mm|cm|in|pt|px)$/.exec(String(value ?? '').trim());
  const factor = match ? MILLIMETRES[match[2] ?? ''] : undefined;
  if (!match || !factor) return null;
  const millimetres = Number(match[1]) * factor;
  return Math.round((unit === 'mm' ? millimetres : millimetres / 25.4) * 100) / 100;
}

/** The unit a page size's margins are written in: millimetres for A and B sizes, else inches. */
export const marginUnit = (size: unknown): 'mm' | 'in' =>
  typeof size === 'string' && /^[AB]\d+$/.test(size) ? 'mm' : 'in';

const SIDES: readonly BoxSide[] = ['top', 'right', 'bottom', 'left'];

// What a margin side may hold while it is typed: digits with one decimal point.
const NUMBER = /^\d*(\.\d*)?$/;

// One side's value: the strip's own small input, holding what is typed until it reads as a number.
function MarginInput({
  label,
  value,
  inherited,
  isDisabled,
  onChange,
}: {
  label: string;
  value: number | null;
  inherited: number | null;
  isDisabled: boolean | undefined;
  onChange: (value: number | null) => void;
}) {
  const external = value === null ? '' : String(value);
  const [draft, setDraft] = useState({ text: external, from: external });
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      disabled={isDisabled}
      placeholder={inherited === null ? undefined : String(inherited)}
      value={draft.from === external ? draft.text : external}
      onChange={(event) => {
        const text = event.currentTarget.value.trim();
        if (!NUMBER.test(text)) return;
        const next = text === '' || text === '.' ? null : Number(text);
        setDraft({ text, from: next === null ? '' : String(next) });
        onChange(next);
      }}
    />
  );
}

/** The margins of the scope's pages. */
export function MarginsRow({ context }: { context: Rows }) {
  const { target, labels, props } = context;
  const read = (path: readonly string[]) => ({
    own: settingAt(target.own, path),
    inherited: target.inherited ? settingAt(target.inherited, path) : undefined,
  });
  const size = read(['page', 'size']);
  const unit = marginUnit(size.own ?? size.inherited);
  return (
    <FourSidePropertyStrip
      label={labels.margins}
      unit={unit}
      isOverridden={SIDES.some((side) => read(['page', 'margins', side]).own !== undefined)}
      renderSide={(side) => {
        const value = read(['page', 'margins', side]);
        return (
          <MarginInput
            label={labels.marginSides[side]}
            value={lengthIn(value.own, unit)}
            inherited={lengthIn(value.inherited, unit)}
            isDisabled={props.isDisabled}
            onChange={(next) =>
              target.set(['page', 'margins', side], next === null ? null : `${String(next)}${unit}`)
            }
          />
        );
      }}
    />
  );
}
