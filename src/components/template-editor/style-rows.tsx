// The rows of a style's card by its parts, the keys they set, and its numbering: whether it
// numbers, then the text before its number, its format and the text after.

import {
  PropertyRow,
  PropertyStrip,
  PropertyStripCell,
} from '@flamboyantengineer/ui-components/property-panel';
import type { ReactNode } from 'react';
import {
  ColourRow,
  FaceRow,
  Field,
  FontRow,
  LineHeightRow,
  SpacingRow,
  type StyleScope,
  styleValue,
} from './style-fields.js';
import { NUMBERING_HINT, type StylePart } from './template-settings.js';

/**
 * Numbering: whether it numbers, then the text before its number, its format and the text after.
 */
export function NumberingRow({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  const enabled = styleValue(scope, ['numbering', 'enabled']);
  return (
    <>
      <PropertyRow
        label={labels.numbered}
        isOverridden={enabled.own !== undefined}
        onReset={() => enabled.set(null)}
      >
        <Field
          scope={scope}
          name="numbering.enabled"
          label={labels.numbered}
          kind={{ type: 'boolean' }}
        />
      </PropertyRow>
      <PropertyRow label={labels.numbering} hint={NUMBERING_HINT}>
        <PropertyStrip>
          <PropertyStripCell letter="«" label={labels.numberPrefix}>
            <Field
              scope={scope}
              name="numbering.prefix"
              label={labels.numberPrefix}
              kind={{ type: 'text' }}
            />
          </PropertyStripCell>
          <PropertyStripCell letter="1" label={labels.numbering}>
            <Field
              scope={scope}
              name="numbering.format"
              label={labels.numbering}
              kind={{ type: 'numbering' }}
            />
          </PropertyStripCell>
          <PropertyStripCell letter="»" label={labels.numberSuffix}>
            <Field
              scope={scope}
              name="numbering.suffix"
              label={labels.numberSuffix}
              kind={{ type: 'text' }}
            />
          </PropertyStripCell>
        </PropertyStrip>
      </PropertyRow>
    </>
  );
}

// The keys each part of a style's rows sets.
const PART_KEYS: Readonly<Record<StylePart, readonly string[]>> = {
  font: ['font', 'size'],
  face: ['weight', 'italic', 'underline'],
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

/** The rows of a style's card, for the parts it has. */
export function StyleRows({
  scope,
  parts,
  code,
}: {
  scope: StyleScope;
  parts: readonly StylePart[];
  /** Code takes its fonts from the editor's `codeFonts`. */
  code?: boolean | undefined;
}): ReactNode {
  const has = (part: StylePart) => parts.includes(part);
  const align = has('justify') ? 'justify' : has('align') ? 'plain' : 'none';
  return (
    <>
      {has('font') ? <FontRow scope={scope} code={code} /> : null}
      {has('face') ? <FaceRow scope={scope} align={align} /> : null}
      {has('colour') ? <ColourRow scope={scope} /> : null}
      {has('spacing') ? <SpacingRow scope={scope} /> : null}
      {has('lineHeight') ? <LineHeightRow scope={scope} /> : null}
      {has('numbering') ? <NumberingRow scope={scope} /> : null}
    </>
  );
}
