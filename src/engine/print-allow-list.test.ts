import { describe, expect, it } from 'vitest';
import { allowSnapshotMarkup, isAllowedAttribute } from './print-allow-list.js';

// A copy of pages holding what a node view or decoration could have drawn.
function pages(markup: string): HTMLElement {
  const copy = document.createElement('div');
  copy.className = 'ProseMirror';
  copy.innerHTML = markup;
  allowSnapshotMarkup(copy);
  return copy;
}

describe('snapshot allow-list', () => {
  it('DOCE-EDITOR-6.23 leaves out what runs, embeds a page or takes input, with its content', () => {
    const copy = pages(
      '<p>Kept<script>alert(1)</script><iframe src="https://example.test"></iframe><button>Go</button><input value="x"><style>p{}</style></p>',
    );
    expect(copy.innerHTML).toBe('<p>Kept</p>');
  });

  it('DOCE-EDITOR-6.23 unwraps other elements off the list and keeps their text', () => {
    const copy = pages(
      '<p><math-field>x + 1</math-field> and <custom-chip><b>bold</b></custom-chip></p>',
    );
    expect(copy.innerHTML).toBe('<p>x + 1 and <b>bold</b></p>');
  });

  it('DOCE-EDITOR-6.23 keeps hooks and drawing attributes and drops handlers and unsafe addresses', () => {
    const copy = pages(
      '<p class="a" id="p1" style="color: red" data-id="p1" aria-label="x" onclick="run()" contenteditable="true">' +
        '<a href="javascript:run()">bad</a><a href="#p1">anchor</a><a href="https://example.test/a">web</a>' +
        '<img src="data:image/png;base64,AA" alt="pic" onerror="run()"><img src="file:///etc/passwd">' +
        '<svg viewBox="0 0 2 2"><path d="M0 0L2 2" stroke="currentColor"></path></svg></p>',
    );
    const paragraph = copy.querySelector('p');
    expect([...(paragraph?.attributes ?? [])].map(({ name }) => name).sort()).toEqual([
      'aria-label',
      'class',
      'data-id',
      'id',
      'style',
    ]);
    expect([...copy.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      null,
      '#p1',
      'https://example.test/a',
    ]);
    const images = [...copy.querySelectorAll('img')];
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      'data:image/png;base64,AA',
      null,
    ]);
    expect(images[0]).not.toHaveAttribute('onerror');
    expect(copy.querySelector('path')).toHaveAttribute('d', 'M0 0L2 2');
  });

  it('DOCE-EDITOR-6.23 refuses a script address hidden by spaces or case and a scripted style', () => {
    expect(isAllowedAttribute('href', ' JaVa\tScRiPt:run()')).toBe(false);
    expect(isAllowedAttribute('href', 'mailto:team@example.test')).toBe(true);
    // Every address a link may hold (`safeHref`) stays a link: a telephone number too.
    expect(isAllowedAttribute('href', 'tel:+15550100')).toBe(true);
    expect(isAllowedAttribute('href', 'notes/page.html')).toBe(true);
    expect(isAllowedAttribute('src', 'data:text/html,<p>')).toBe(false);
    expect(isAllowedAttribute('style', 'background: url(javascript:run())')).toBe(false);
    expect(isAllowedAttribute('style', 'width: expression(run())')).toBe(false);
    expect(isAllowedAttribute('srcset', 'a.png 1x')).toBe(false);
  });
});
