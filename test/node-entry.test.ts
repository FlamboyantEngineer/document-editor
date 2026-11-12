// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('server-safe entry points', () => {
  it('DOCE-ENTRY-1.2 loads ./model, ./document and ./host without DOM globals', async () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const [model, documents, host] = await Promise.all([
      import('../src/model/index.js'),
      import('../src/document/index.js'),
      import('../src/host/index.js'),
    ]);
    expect(model.createDocumentSchema).toBeTypeOf('function');
    expect(documents.compareVersions).toBeTypeOf('function');
    expect(host.createMemoryHost).toBeTypeOf('function');
    expect(typeof document).toBe('undefined');
  });

  it('DOCE-ENTRY-1.1 reads, compares and describes a stored document on a server', async () => {
    const { createDocumentSchema, readDocumentFile } = await import('../src/model/index.js');
    const { compareVersions, describeBlocks, diffText } = await import('../src/document/index.js');
    const schema = createDocumentSchema();
    const read = (text: string) =>
      readDocumentFile(
        {
          formatVersion: 1,
          sections: [
            {
              name: null,
              content: [
                { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text }] },
              ],
            },
          ],
        },
        schema,
      );
    const [older, newer] = [read('Alpha'), read('Alpha beta')];
    expect(compareVersions(older, newer).map(({ kind, id }) => [kind, id])).toEqual([
      ['modification', 'a0000001'],
    ]);
    expect(describeBlocks(newer).map(({ elementId, text }) => [elementId, text])).toEqual([
      ['a0000001', 'Alpha beta'],
    ]);
    expect(diffText('Alpha', 'Alpha beta').map(({ kind }) => kind)).toContain('inserted');
  });
});
