import { Blob as NodeBlob } from 'node:buffer';
import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
import type { MeasureContext } from '@chenglou/pretext';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fontsourceFaces, harfBuzzWasm } from '../../test/font-files-node.js';
import { createFontFileMeasurer } from '../layout-engine/font-files/measurer.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

// Two hosts serving different bytes under one logical family: Arimo and Cousine, both as "Body".
const FAMILY = 'Body';
// The base template with every family it names as that one.
const template = JSON.parse(
  JSON.stringify(BASE_TEMPLATE).replace(/"(?:Arial|Courier New)"/gu, JSON.stringify(FAMILY)),
) as typeof BASE_TEMPLATE;
const schema = createDocumentSchema();
const node = (name: string, content: Parameters<typeof schema.node>[2], attrs = null) =>
  schema.node(name, attrs, content);
const words = (count: number) =>
  Array.from({ length: count }, (_, index) => `word${String(index)}`).join(' ');
const header = node('page_header', [node('paragraph', [schema.text(`Header ${words(38)}`)])]);
const footer = node('page_footer', [node('paragraph', [schema.text(`Footer ${words(38)}`)])]);
const body = node('paragraph', [schema.text(`Body ${words(120)}`)]);

let contexts: Record<'arimo' | 'cousine', () => MeasureContext>;

beforeAll(async () => {
  // jsdom's Blob cannot stream nor inflate, which reading a WOFF file needs.
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('DecompressionStream', NodeDecompressionStream);
  const contextOf = async (face: 'arimo' | 'cousine') => {
    const measurer = await createFontFileMeasurer({
      wasm: harfBuzzWasm(),
      faces: fontsourceFaces(face, FAMILY),
    });
    return () => measurer.createContext() as unknown as MeasureContext;
  };
  contexts = { arimo: await contextOf('arimo'), cousine: await contextOf('cousine') };
  vi.unstubAllGlobals();
});

const engines: PagesTextEngine[] = [];
const engineWith = (face: 'arimo' | 'cousine') => {
  const engine = createPagesTextEngine({
    template,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
    measureContext: contexts[face],
    isFontServed: (family) => family === FAMILY,
  });
  engines.push(engine);
  return engine;
};

afterAll(() => {
  for (const engine of engines) engine.destroy();
});

// What an engine measures of the header, the footer and the body, in that order.
const measured = (engine: PagesTextEngine) => ({
  header: engine.measureRegion(header, null)?.height,
  footer: engine.measureRegion(footer, null)?.height,
  body: engine.measureBlock(body, null)?.height,
  lines: engine.lines(body, { scope: null })?.lines.length,
});

describe('engines with different fonts under one family', () => {
  it('DOCE-PAGINATION-12.6 measures headers, footers and body text with its own fonts, interleaved', () => {
    const alone = {
      arimo: measured(engineWith('arimo')),
      cousine: measured(engineWith('cousine')),
    };
    // The fonts differ enough to be told apart in every kind.
    expect(alone.arimo.header).toBeLessThan(alone.cousine.header ?? 0);
    expect(alone.arimo.footer).toBeLessThan(alone.cousine.footer ?? 0);
    expect(alone.arimo.lines).toBeLessThan(alone.cousine.lines ?? 0);
    // Made one after the other, each engine measures every kind after the other one has.
    const a = engineWith('arimo');
    const b = engineWith('cousine');
    const interleaved = { arimo: {}, cousine: {} } as Record<
      'arimo' | 'cousine',
      Record<string, unknown>
    >;
    interleaved.cousine.header = b.measureRegion(header, null)?.height;
    interleaved.arimo.header = a.measureRegion(header, null)?.height;
    interleaved.cousine.footer = b.measureRegion(footer, null)?.height;
    interleaved.arimo.footer = a.measureRegion(footer, null)?.height;
    interleaved.cousine.body = b.measureBlock(body, null)?.height;
    interleaved.arimo.body = a.measureBlock(body, null)?.height;
    interleaved.cousine.lines = b.lines(body, { scope: null })?.lines.length;
    interleaved.arimo.lines = a.lines(body, { scope: null })?.lines.length;
    expect(interleaved).toEqual(alone);
    // What they kept is what they measured alone.
    expect(measured(a)).toEqual(alone.arimo);
    expect(measured(b)).toEqual(alone.cousine);
  });
});
