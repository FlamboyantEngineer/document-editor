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
    const back = readDocumentFile(file, documentSchema).doc;
    expect(findNode(back, 'script_block')?.attrs.script).toBe('count');
  });
});

describe('script provenance and signatures', () => {
  const provenance = { source: 'catalog/count', revision: 'r2', inputs: 'k1' };
  const signatures = [{ person: 'person-1', label: 'Sam Lee', revision: 'r2' }];
  const markup = `<section class="script-block" data-block-type="scripted-content" data-script="count" data-provenance='${JSON.stringify(provenance)}' data-signatures='${JSON.stringify(signatures)}'><div class="script-output"><p>Ran</p></div></section>`;

  it('DOCE-SCHEMA-3.9 keeps where a script output came from and the signatures it carries', () => {
    const block = findNode(parseMarkup(markup), 'script_block');
    expect(block?.attrs).toMatchObject({ provenance, signatures });
    expect(roundTrip(markup)).toContain('data-signatures=');
  });

  it('DOCE-SCHEMA-3.9 stores them as provenance and signatures, and reads none from bad markup', () => {
    const stored = writeDocumentFile(parseMarkup(markup)).sections[0]?.content[0];
    expect(stored?.attrs).toMatchObject({ provenance, signatures });
    const bad = markup.replace(/data-provenance='[^']*'/, "data-provenance='[1]'");
    expect(findNode(parseMarkup(bad), 'script_block')?.attrs.provenance).toBeNull();
  });
});
