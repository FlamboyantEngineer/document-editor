import { describe, expect, it } from 'vitest';
import { prepareSnapshotImages } from './print-images.js';

function images(markup: string, resolve?: (src: string) => string | null) {
  const copy = document.createElement('div');
  copy.innerHTML = markup;
  prepareSnapshotImages(copy, resolve);
  return [...copy.querySelectorAll('img')];
}

describe('snapshot images', () => {
  it('DOCE-EDITOR-6.25 loads every image at once', () => {
    const [image] = images('<img src="a.png" loading="lazy" decoding="async">');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'sync');
    expect(image).toHaveAttribute('src', 'a.png');
  });

  it('DOCE-EDITOR-6.25 loads each image from the address the host gives, or its own', () => {
    const seen: string[] = [];
    const printed = images('<img src="a.png" srcset="a2.png 2x"><img src="b.png">', (src) => {
      seen.push(src);
      return src === 'a.png' ? 'https://assets.example.test/a.png' : null;
    });
    expect(seen).toEqual(['a.png', 'b.png']);
    expect(printed[0]).toHaveAttribute('src', 'https://assets.example.test/a.png');
    expect(printed[0]).not.toHaveAttribute('srcset');
    expect(printed[1]).toHaveAttribute('src', 'b.png');
  });
});
