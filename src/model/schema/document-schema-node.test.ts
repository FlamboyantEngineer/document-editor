// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDocumentSchema } from '../index.js';

describe('createDocumentSchema on a server', () => {
  it('DOCE-SCHEMA-1.1 builds without a DOM and reads a stored document', () => {
    expect(typeof document).toBe('undefined');
    const schema = createDocumentSchema();
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { dataId: 'p1', paragraphLevel: 2 },
          content: [{ type: 'text', text: 'Hello', marks: [{ type: 'strong' }] }],
        },
      ],
    });
    doc.check();
    expect(doc.firstChild?.attrs).toMatchObject({ dataId: 'p1', paragraphLevel: 2 });
  });
});
