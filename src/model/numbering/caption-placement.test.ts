import { describe, expect, it } from 'vitest';
import { buildCaptionPlacementVariables, resolveCaptionPlacement } from '../index.js';

describe('caption placement', () => {
  it('DOCE-NUMBERING-4.1 places captions where the template object styles say', () => {
    expect(resolveCaptionPlacement('below')).toBe('below');
    expect(resolveCaptionPlacement('left', 'below')).toBe('below');
    expect(buildCaptionPlacementVariables(null)).toEqual({
      '--doc-table-caption-side': 'top',
      '--doc-figure-caption-order': '1',
      '--doc-code-caption-order': '-1',
    });
    expect(
      buildCaptionPlacementVariables({
        table: { captionPlacement: 'below' },
        codeBlock: { captionPlacement: 'below' },
      }),
    ).toEqual({
      '--doc-table-caption-side': 'bottom',
      '--doc-figure-caption-order': '1',
      '--doc-code-caption-order': '1',
    });
  });

  it('DOCE-NUMBERING-4.1 gives only the kinds a style sets when defaults are off', () => {
    expect(
      buildCaptionPlacementVariables({ figure: { captionPlacement: 'above' } }, false),
    ).toEqual({ '--doc-figure-caption-order': '-1' });
  });
});
