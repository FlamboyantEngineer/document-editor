import { describe, expect, it } from 'vitest';
import { preloadEditorSurfaces, SURFACE_LOADERS } from './lazy-surfaces.js';

describe('preloadEditorSurfaces', () => {
  it('DOCE-ENTRY-2.3 loads every surface that loads on first use, or those named', async () => {
    await expect(preloadEditorSurfaces(['figure', 'symbols'])).resolves.toBeUndefined();
    await expect(preloadEditorSurfaces()).resolves.toBeUndefined();
    const figure = await SURFACE_LOADERS.figure();
    expect(figure.FigureDialog).toEqual(expect.any(Function));
    const symbols = await SURFACE_LOADERS.symbols();
    expect(symbols.CharacterGrid).toEqual(expect.any(Function));
  });
});
