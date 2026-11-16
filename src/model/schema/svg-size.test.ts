import { DOMSerializer } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema, findNode, parseMarkup } from '../../../test/document-markup.js';
import { svgIntrinsicSize } from './svg-size.js';

const svg = (root: string) => `data:image/svg+xml,${encodeURIComponent(`<svg ${root}></svg>`)}`;

function written(attrs: Record<string, unknown>): HTMLElement {
  const figure = documentSchema.nodes.figure;
  if (!figure) throw new Error('The schema has figures');
  return DOMSerializer.fromSchema(documentSchema).serializeNode(
    figure.create(attrs),
  ) as HTMLElement;
}

describe('svgIntrinsicSize', () => {
  it('DOCE-SCHEMA-3.13 reads the size an inline SVG states, by its root or its view box', () => {
    expect(svgIntrinsicSize(svg('width="120" height="80px"'))).toEqual({ width: 120, height: 80 });
    expect(svgIntrinsicSize(svg('width="200" viewBox="0 0 100 50"'))).toEqual({
      width: 200,
      height: 100,
    });
    expect(svgIntrinsicSize(svg('height="30" viewBox="0 0 100 50"'))).toEqual({
      width: 60,
      height: 30,
    });
    expect(svgIntrinsicSize(svg('viewBox="0,0,64,48"'))).toEqual({ width: 64, height: 48 });
    const base64 = `data:image/svg+xml;base64,${btoa('<svg width="10" height="20"></svg>')}`;
    expect(svgIntrinsicSize(base64)).toEqual({ width: 10, height: 20 });
    expect(svgIntrinsicSize(svg('width="50%" height="2em"'))).toBeNull();
    expect(svgIntrinsicSize('https://example.com/a.svg')).toBeNull();
    expect(svgIntrinsicSize('data:image/svg+xml,%E0%A4%A')).toBeNull();
  });

  it('DOCE-SCHEMA-3.13 writes an unsized inline SVG figure at its size, and stores none', () => {
    const src = svg('width="120" height="80"');
    const image = written({ src }).querySelector('img');
    expect(image).toHaveAttribute('width', '120');
    expect(image).toHaveAttribute('height', '80');
    const sized = written({ src, width: 60, height: 40 }).querySelector('img');
    expect(sized).toHaveAttribute('width', '60');
    const diagram = written({ src, figureType: 'diagram' }).querySelector('img');
    expect(diagram).not.toHaveAttribute('width');
    const read = findNode(parseMarkup(written({ src }).outerHTML), 'figure');
    expect(read?.attrs).toMatchObject({ width: null, height: null });
  });
});
