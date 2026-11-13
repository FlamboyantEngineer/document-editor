// Four sides as one row, such as the page margins, in millimetres on an A or B size page and in
// inches otherwise, or a contents list's padding, in points. Each side holds the scope's own value
// and shows the one it inherits while it has none.

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
export function lengthIn(value: unknown, unit: 'mm' | 'in' | 'pt'): number | null {
  const match = /^(\d+(?:\.\d+)?)(mm|cm|in|pt|px)$/.exec(String(value ?? '').trim());
  const factor = match ? MILLIMETRES[match[2] ?? ''] : undefined;
  if (!match || !factor) return null;
  const millimetres = Number(match[1]) * factor;
  return Math.round((millimetres / (MILLIMETRES[unit] ?? 1)) * 100) / 100;
}

/** The unit a page size's margins are written in: millimetres for A and B sizes, else inches. */
export const marginUnit = (size: unknown): 'mm' | 'in' =>
  typeof size === 'string' && /^[AB]\d+$/.test(size) ? 'mm' : 'in';

const SIDES: readonly BoxSide[] = ['top', 'right', 'bottom', 'left'];

// What a margin side may hold while it is typed: digits with one decimal point.
const NUMBER = /^\d*(\.\d*)?$/;

// One side's value: the strip's own small input, holding what is typed until it reads as a number.
function SideInput({
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

/**
 * Four sides at a path of the rows' target: the page margins in the page's own unit, or a length
 * in points.
 */
export function SidesRow({
  context,
  path,
  label,
  side: noun,
  unit: kind,
}: {
  context: Rows;
  path: readonly string[];
  label: string;
  /** What one side is called, after its name, such as `margin` in `Top margin`. */
  side: string;
  unit: 'page' | 'pt';
}) {
  const { target, labels, props } = context;
  const read = (at: readonly string[]) => ({
    own: settingAt(target.own, at),
    inherited: target.inherited ? settingAt(target.inherited, at) : undefined,
  });
  const size = read(['page', 'size']);
  const unit = kind === 'pt' ? 'pt' : marginUnit(size.own ?? size.inherited);
  return (
    <FourSidePropertyStrip
      label={label}
      unit={unit}
      isOverridden={SIDES.some((side) => read([...path, side]).own !== undefined)}
      renderSide={(side) => {
        const value = read([...path, side]);
        return (
          <SideInput
            label={`${labels.sides[side]} ${noun}`}
            value={lengthIn(value.own, unit)}
            inherited={lengthIn(value.inherited, unit)}
            isDisabled={props.isDisabled}
            onChange={(next) =>
              target.set([...path, side], next === null ? null : `${String(next)}${unit}`)
            }
          />
        );
      }}
    />
  );
}
