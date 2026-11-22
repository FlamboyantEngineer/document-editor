// The reference faces and HarfBuzz read from the dev dependencies in Node, for the font-file
// measurer's tests: the same WOFF files the labs serve from `labs/build/fonts/`.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { ServedFace } from '../src/layout-engine/font-files/faces.js';
import { REFERENCE_FACES } from './font-files-reference.js';

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

function fontPath(file: string): string {
  if (file.startsWith('KaTeX_')) return join(packageDir('katex'), 'dist', 'fonts', file);
  const name = file.startsWith('geist-mono') ? '@fontsource/geist-mono' : '@fontsource/geist';
  return join(packageDir(name), 'files', file);
}

const bytesOf = (path: string) => new Uint8Array(readFileSync(path));

/** harfbuzzjs's `harfbuzz.wasm`. */
export function harfBuzzWasm(): Uint8Array<ArrayBuffer> {
  return bytesOf(join(dirname(require.resolve('harfbuzzjs')), 'harfbuzz.wasm'));
}

/** The reference faces with their bytes. */
export function referenceFaces(): ServedFace[] {
  return REFERENCE_FACES.map(({ file, ...face }) => ({ ...face, bytes: bytesOf(fontPath(file)) }));
}
