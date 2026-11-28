import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { planCodeSplit } from './code-split.js';
import { joinFragments } from './fragments.js';
import { layoutPages, PAGE_SAFETY_MARGIN_PX } from './page-layout.js';

const LINE = 10;
const OVERHEAD = 6;

describe('code splits', () => {
  it('DOCE-PAGINATION-3.3 lays out many continuations without scanning their remaining lines', () => {
    const rows = 4_096;
    const rowsPerPage = 32;
    const width = 8;
    const source = 'x'.repeat(rows * width);
    const node = documentSchema.node('code_block', null, [documentSchema.text(source)]);
    let reads = 0;
    const lines = Array.from({ length: rows }, (_, index) => ({
      get from() {
        reads += 1;
        return index * width;
      },
      get height() {
        reads += 1;
        return LINE;
      },
    }));
    const block = {
      node,
      height: rows * LINE + OVERHEAD,
      marginTop: 0,
      marginBottom: 0,
      measurement: {
        offset: 0,
        overhead: OVERHEAD,
        lines: { lines },
        measure(from: number, to: number) {
          const count = (to - from) / width;
          return { lines: count, height: count * LINE };
        },
      },
    };
    const height = rowsPerPage * LINE + OVERHEAD;
    const pages = layoutPages([block], { pageHeight: height + PAGE_SAFETY_MARGIN_PX });
    const parts = pages.flat();
    expect(pages).toHaveLength(rows / rowsPerPage);
    expect(parts.map((part) => part.height)).toEqual(Array(pages.length).fill(height));
    expect(parts.slice(1).every((part) => part.node.attrs.codeLineContinued === true)).toBe(true);
    expect(joinFragments(parts.map((part) => part.node))[0]?.textContent).toBe(source);
    expect(reads).toBeLessThan(20_000);
  });

  it('DOCE-PAGINATION-3.3 preserves the order of legacy wrapped line measurements', () => {
    const lines = [0, 24, 8, 16, 32].map((from) => ({ from, height: LINE }));
    const plan = planCodeSplit({
      text: 'x'.repeat(24),
      height: 3 * LINE + OVERHEAD,
      fitting: 2 * LINE + OVERHEAD,
      wrapAtStart: true,
      measurement: {
        offset: 8,
        overhead: OVERHEAD,
        lines: { lines },
        measure: () => ({ lines: 3, height: 3 * LINE }),
      },
    });
    expect(plan).toEqual({ end: 8, next: 8, headHeight: 26, tailHeight: 16 });
  });
});
