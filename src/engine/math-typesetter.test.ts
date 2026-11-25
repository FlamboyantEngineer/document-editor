import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { createMathTypesetter } from './math-typesetter.js';

const { nodes } = documentSchema;

const options = (render: () => Promise<{ ok: true; mathml: string }>) => ({
  render,
  invalid: { inline: 'Invalid math', display: 'Invalid math' },
  timeout: { ms: 30_000, message: 'Too slow' },
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createMathTypesetter', () => {
  it('DOCE-PAGINATION-10.8 leaves no deadline behind once the renderer answers', async () => {
    vi.useFakeTimers();
    const typesetter = createMathTypesetter(
      options(() => Promise.resolve({ ok: true, mathml: '<math><mi>x</mi></math>' })),
    );
    const answer = typesetter.typeset(false, 'x', document);
    expect(vi.getTimerCount()).toBe(1);
    await expect(answer).resolves.toMatchObject({ typeset: { state: 'ready' } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('DOCE-PAGINATION-10.8 keeps the math of the document readied, however much it holds', async () => {
    const typesetter = createMathTypesetter(
      options(() => Promise.resolve({ ok: true, mathml: '<math><mi>x</mi></math>' })),
    );
    const math = Array.from({ length: 2100 }, (_, index) =>
      nodes.math_inline?.create(null, documentSchema.text(String(index))),
    ).filter((node) => node !== undefined);
    const paragraph = nodes.paragraph?.create(null, math);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!doc) throw new Error('The schema has math');
    await typesetter.ready(doc, document);
    expect(typesetter.ready(doc, document)).toBeNull();
    expect(math.every((node) => typesetter.of(node)?.state === 'ready')).toBe(true);
  });
});
