import { describe, expect, it } from 'vitest';
import { documentSchema, findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';
import { readDocumentFile, writeDocumentFile } from '../index.js';

const BLOCK =
  '<section class="script-block" data-block-type="scripted-content" data-script="count" data-refresh-policy="open" data-rendered-at="2026-03-01T00:00:00.000Z"><div class="script-output"><p>Ran</p></div></section>';

describe('script nodes', () => {
  it('DOCE-SCHEMA-3.9 keeps a script block with its script, policy, time and output', () => {
    const doc = parseMarkup(BLOCK);
    expect(findNode(doc, 'script_block')?.attrs).toMatchObject({
      script: 'count',
      refreshPolicy: 'open',
      renderedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(findNode(doc, 'script_block')?.textContent).toBe('Ran');
    expect(roundTrip(BLOCK)).toContain('data-refresh-policy="open"');
  });

  it('DOCE-SCHEMA-3.9 stores a script block as a script node', () => {
    const file = writeDocumentFile(parseMarkup(BLOCK));
    const stored = file.sections[0]?.content.find((node) => node.type === 'script');
    expect(stored?.attrs).toMatchObject({ source: 'count', refresh: 'open' });
    const back = readDocumentFile(file, documentSchema);
    expect(findNode(back, 'script_block')?.attrs.script).toBe('count');
  });
});
