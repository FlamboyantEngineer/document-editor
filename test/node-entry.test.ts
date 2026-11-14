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
      ).doc;
    const [older, newer] = [read('Alpha'), read('Alpha beta')];
    expect(compareVersions(older, newer).map(({ kind, id }) => [kind, id])).toEqual([
      ['modification', 'a0000001'],
    ]);
    expect(describeBlocks(newer).map(({ elementId, text }) => [elementId, text])).toEqual([
      ['a0000001', 'Alpha beta'],
    ]);
    expect(diffText('Alpha', 'Alpha beta').map(({ kind }) => kind)).toContain('inserted');
  });

  it('DOCE-ENTRY-1.1 exports the stored-file readers and the merge a server runs', async () => {
    const documents = await import('../src/document/index.js');
    for (const name of [
      'mergeDocuments',
      'storedEmbeds',
      'storedContributors',
      'updateStoredThreads',
      'authoredContent',
    ] as const) {
      expect(documents[name]).toBeTypeOf('function');
    }
    expect(typeof document).toBe('undefined');
  });

  it('DOCE-ENTRY-1.3 seeds a shared room and reads it back without DOM globals', async () => {
    const { createDocumentSchema } = await import('../src/model/index.js');
    const { documentToYjs, yjsToDocument } = await import('../src/collab/index.js');
    expect(typeof document).toBe('undefined');
    const schema = createDocumentSchema();
    const file = {
      formatVersion: 1 as const,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              attrs: { id: 'a0000001' },
              content: [{ type: 'text', text: 'Alpha' }],
            },
          ],
        },
      ],
    };
    const update = documentToYjs(file, { schema });
    expect(yjsToDocument(update, { schema })?.sections).toEqual(file.sections);
    expect(typeof window).toBe('undefined');
  });
});

describe('server entry packages', () => {
  // Packages that draw the editor; a server entry that loads one installs and runs the browser stack.
  const VIEW_PACKAGES =
    /^(react|react-dom|react-aria|react-aria-components|react-stately|react-reconciler|@handlewithcare\/react-prosemirror|@flamboyantengineer\/ui-components\/rich-text-editor)$/;

  // The packages an entry loads at run time: its modules bundled, every package left external, and
  // type-only imports dropped as the compiled entry drops them.
  async function loadedPackages(entry: string): Promise<string[]> {
    const { build } = await import('esbuild');
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      logLevel: 'silent',
    });
    const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
    return [...new Set(imports.filter((item) => item.external).map((item) => item.path))];
  }

  it('DOCE-ENTRY-1.4 loads no editor view package from ./model, ./document or ./collab', async () => {
    for (const entry of ['src/model/index.ts', 'src/document/index.ts', 'src/collab/index.ts']) {
      const packages = await loadedPackages(entry);
      expect(
        packages.filter((name) => VIEW_PACKAGES.test(name)),
        entry,
      ).toEqual([]);
    }
  }, 30_000);
});
