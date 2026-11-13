// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('the import entry', () => {
  it('DOCE-IMPORT-1.1 loads and composes a document without DOM globals', async () => {
    expect(typeof document).toBe('undefined');
    const entry = await import('./index.js');
    const file = entry.composeDocumentFile(
      [{ type: 'paragraph', content: [{ type: 'text', text: 'Imported' }] }],
      { template: { formatVersion: 1, id: 'plain' }, newId: () => '0000000a' },
    );
    expect(file.sections).toEqual([
      {
        content: [
          {
            type: 'paragraph',
            attrs: { id: '0000000a' },
            content: [{ type: 'text', text: 'Imported' }],
          },
        ],
      },
    ]);
    expect(entry.selectStoredContent(file, { section: 'none' })).toBeNull();
    expect(typeof window).toBe('undefined');
  });
});
