// The rows of a style's card by its parts, the keys they set, and its numbering: whether it
// numbers, then the text before its number, its format and the text after.

import {
  PropertyRow,
  PropertyStrip,
  PropertyStripCell,
} from '@flamboyantengineer/ui-components/property-panel';
import type { ReactNode } from 'react';
import { AlignRow, FaceToggles } from './style-face.js';
import {
  ColourRow,
  Field,
  FontRow,
  SizeRow,
  SpacingRow,
  type StyleScope,
  styleValue,
} from './style-fields.js';
import {
  NUMBER_PREFIX_TIP,
  NUMBER_SUFFIX_TIP,
  NUMBERING_HINT,
  type StylePart,
} from './template-settings.js';

/** The text before a style's number, its format and the text after, as one strip. */
export function NumberingStrip({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  return (
    <PropertyStrip>
      <PropertyStripCell letter="«" label={labels.numberPrefix}>
        <Field
          scope={scope}
          name="numbering.prefix"
          label={labels.numberPrefix}
          kind={{ type: 'text' }}
          tip={NUMBER_PREFIX_TIP}
        />
      </PropertyStripCell>
      <PropertyStripCell letter="1" label={labels.numbering}>
        <Field
          scope={scope}
          name="numbering.format"
          label={labels.numbering}
          kind={{ type: 'numbering' }}
          tip={NUMBERING_HINT}
        />
      </PropertyStripCell>
      <PropertyStripCell letter="»" label={labels.numberSuffix}>
        <Field
          scope={scope}
          name="numbering.suffix"
          label={labels.numberSuffix}
          kind={{ type: 'text' }}
          tip={NUMBER_SUFFIX_TIP}
        />
      </PropertyStripCell>
    </PropertyStrip>
  );
}

/**
 * Numbering: whether it numbers, then, unless a section's heading numbering rows hold them, the
 * text before its number, its format and the text after.
 */
function NumberingRow({ scope, strip }: { scope: StyleScope; strip: boolean }) {
  const { labels } = scope.context;
  const enabled = styleValue(scope, ['numbering', 'enabled']);
  return (
    <>
      <PropertyRow label={labels.numbered} isOverridden={enabled.own !== undefined}>
        <Field
          scope={scope}
          name="numbering.enabled"
          label={labels.numbered}
          kind={{ type: 'boolean' }}
        />
      </PropertyRow>
      {strip ? (
        <PropertyRow label={labels.numbering} hint={NUMBERING_HINT}>
          <NumberingStrip scope={scope} />
        </PropertyRow>
      ) : null}
    </>
  );
}

// The keys each part of a style's rows sets.
const PART_KEYS: Readonly<Record<StylePart, readonly string[]>> = {
  font: ['font', 'size'],
  size: ['size'],
  face: ['weight', 'italic', 'underline'],
  emphasis: ['weight', 'italic'],
  align: ['alignment'],
  justify: ['alignment'],
  colour: ['color'],
  spacing: ['spaceBefore', 'spaceAfter'],
  lineHeight: ['lineHeight'],
  numbering: ['numbering'],
};

/** The paths, below the style, that the rows of its parts set. */
export const styleKeys = (parts: readonly StylePart[]): string[][] =>
  parts.flatMap((part) => PART_KEYS[part].map((key) => [key]));

// The face toggles a style's parts give: all three, bold and italic only, or none.
function togglesOf(scope: StyleScope, has: (part: StylePart) => boolean): ReactNode {
  if (has('face')) return <FaceToggles scope={scope} />;
  return has('emphasis') ? <FaceToggles scope={scope} underline={false} /> : null;
}

/**
 * The rows of a style's card, for the parts it has, in order: the font, its size and face; the
 * alignment and line height; the spacing; the colour; the numbering.
 */
export function StyleRows({
  scope,
  parts,
  code,
  numberingElsewhere = false,
}: {
  scope: StyleScope;
  parts: readonly StylePart[];
  /** Code takes its fonts from the editor's `codeFonts`. */
  code?: boolean | undefined;
  /** Whether the numbering's format fields are elsewhere, as a section's are. */
  numberingElsewhere?: boolean | undefined;
}): ReactNode {
  const has = (part: StylePart) => parts.includes(part);
  const align = has('justify') ? 'justify' : has('align') ? 'plain' : 'none';
  const toggles = togglesOf(scope, has);
  const { labels } = scope.context;
  return (
    <>
      {has('font') ? <FontRow scope={scope} code={code} toggles={toggles} /> : null}
      {has('size') ? <SizeRow scope={scope} /> : null}
      {toggles && !has('font') ? <PropertyRow label={labels.face}>{toggles}</PropertyRow> : null}
      {align !== 'none' || has('lineHeight') ? (
        <AlignRow scope={scope} align={align} lineHeight={has('lineHeight')} />
      ) : null}
      {has('spacing') ? <SpacingRow scope={scope} /> : null}
      {has('colour') ? <ColourRow scope={scope} /> : null}
      {has('numbering') ? <NumberingRow scope={scope} strip={!numberingElsewhere} /> : null}
    </>
  );
}
