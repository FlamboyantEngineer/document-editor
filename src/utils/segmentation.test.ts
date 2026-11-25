import { describe, expect, it } from 'vitest';
import boundaries from '../../test/fixtures/segmentation/boundaries.json' with { type: 'json' };
import {
  graphemeSegmenter,
  SEGMENTATION_CORPUS,
  SEGMENTATION_LOCALE,
  segmentationFingerprint,
  segmentBoundaries,
} from './segmentation.js';

describe('segmentation', () => {
  it('DOCE-PAGINATION-9.15 segments the conformance corpus as the expected boundaries say', () => {
    expect(segmentBoundaries(SEGMENTATION_CORPUS, SEGMENTATION_LOCALE)).toEqual(boundaries.node);
  });

  it('DOCE-PAGINATION-9.15 segments in its own language, not the runtime default', () => {
    expect(graphemeSegmenter().resolvedOptions().locale).toBe(SEGMENTATION_LOCALE);
    expect(segmentationFingerprint()).toMatch(/^[0-9a-f]{8}$/);
    expect(segmentationFingerprint()).toBe(segmentationFingerprint());
  });
});
