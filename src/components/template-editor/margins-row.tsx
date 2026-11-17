// Four sides as one row, such as the page margins, in millimetres on an A or B size page, in
// inches on another page and in pixels for the web layout, or a contents list's padding, in points. Each side holds the scope's own value
// and shows the one it inherits while it has none.

import {
  type BoxSide,
  FourSidePropertyStrip,
} from '@flamboyantengineer/ui-components/four-side-property-strip';
import { useEffect, useState } from 'react';
import { useCommitOnLeave, useTemplateDraft, useTextDraft } from './setting-drafts.js';
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

/**
 * A length in the unit given, with every digit it holds, so 0.125in stays 0.125, rounded only past
 * a conversion's noise; null when it is not a length.
 */
function lengthIn(value: unknown, unit: 'mm' | 'in' | 'pt' | 'px'): number | null {
  const match = /^(\d+(?:\.\d+)?)(mm|cm|in|pt|px)$/.exec(String(value ?? '').trim());
  const factor = match ? MILLIMETRES[match[2] ?? ''] : undefined;
  if (!match || !factor) return null;
  const millimetres = Number(match[1]) * factor;
  return Number((millimetres / (MILLIMETRES[unit] ?? 1)).toPrecision(12));
}

/** The unit a page size's margins are written in: millimetres for A and B sizes, else inches. */
const marginUnit = (size: unknown): 'mm' | 'in' =>
  typeof size === 'string' && /^[AB]\d+$/.test(size) ? 'mm' : 'in';

const SIDES: readonly BoxSide[] = ['top', 'right', 'bottom', 'left'];

// A side's value: a non-negative number.
const NUMBER = /^(\d+(\.\d*)?|\.\d+)$/;

// One side's value: the strip's own small input, holding what is typed as a draft until Enter or
// leaving it commits a number, or inheriting once emptied; Escape puts the value back, and a draft
// that is not a number says so and is never committed.
function SideInput({
  label,
  value,
  inherited,
  isDisabled,
  onChange,
  onProblem,
}: {
  label: string;
  value: number | null;
  inherited: number | null;
  isDisabled: boolean | undefined;
  onChange: (value: number | null) => void;
  onProblem: (isInvalid: boolean) => void;
}) {
  const external = value === null ? '' : String(value);
  const [text, setText] = useTextDraft(external);
  const isInvalid = text !== external && text.trim() !== '' && !NUMBER.test(text.trim());
  useTemplateDraft(isInvalid ? 'invalid' : text === external ? 'clean' : 'pending');
  useEffect(() => {
    onProblem(isInvalid);
  }, [onProblem, isInvalid]);
  const commit = () => {
    const typed = text.trim();
    if (typed === external || isInvalid) return;
    onChange(typed === '' ? null : Number(typed));
  };
  useCommitOnLeave(commit);
  return (
    <input
      aria-label={label}
      aria-invalid={isInvalid || undefined}
      inputMode="decimal"
      disabled={isDisabled}
      placeholder={inherited === null ? undefined : String(inherited)}
      value={text}
      onChange={(event) => setText(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape' && text !== external) {
          event.preventDefault();
          event.stopPropagation();
          setText(external);
        }
      }}
    />
  );
}

/**
 * Four sides at a path of the rows' target: the page margins in the page's own unit, or in pixels
 * for the web layout, or a length in points.
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
  const [invalid, setInvalid] = useState<ReadonlySet<BoxSide>>(new Set());
  const [problems] = useState(
    () =>
      Object.fromEntries(
        SIDES.map((side) => [
          side,
          (isInvalid: boolean) =>
            setInvalid((before) => {
              if (before.has(side) === isInvalid) return before;
              const next = new Set(before);
              if (isInvalid) next.add(side);
              else next.delete(side);
              return next;
            }),
        ]),
      ) as Record<BoxSide, (isInvalid: boolean) => void>,
  );
  const read = (at: readonly string[]) => ({
    own: settingAt(target.own, at),
    inherited: target.inherited ? settingAt(target.inherited, at) : undefined,
  });
  const size = read(['page', 'size']);
  const unit =
    kind === 'pt' ? 'pt' : props.layout === 'web' ? 'px' : marginUnit(size.own ?? size.inherited);
  return (
    <FourSidePropertyStrip
      label={label}
      unit={unit}
      errors={Object.fromEntries(
        SIDES.filter((side) => invalid.has(side)).map((side) => [side, labels.numberInvalid]),
      )}
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
            onProblem={problems[side]}
          />
        );
      }}
    />
  );
}
