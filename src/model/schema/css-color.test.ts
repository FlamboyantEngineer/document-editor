import { describe, expect, it } from 'vitest';
import { isCssColor } from './css-color.js';

describe('isCssColor', () => {
  it('DOCE-COLLAB-1.1 takes hex colours, colour names and colour functions of numbers', () => {
    for (const color of [
      '#c00',
      '#cc0000',
      '#cc000080',
      'rebeccapurple',
      'currentColor',
      'rgb(204, 0, 0)',
      'rgb(204 0 0 / 50%)',
      'hsl(120deg 50% 40%)',
      'oklch(0.7 0.15 250)',
      'color(display-p3 1 0.2 0.1)',
    ])
      expect(isCssColor(color), color).toBe(true);
  });

  it('DOCE-COLLAB-1.1 refuses what could end the declaration or name another resource', () => {
    for (const value of [
      'red; position: fixed',
      'red;',
      'url(https://example.invalid/x)',
      'rgb(0 0 0); inset: 0',
      'rgb(var(--x) 0 0)',
      'expression(1)',
      '#zzz',
      '#12345',
      'red "x"',
      '',
      null,
      undefined,
      12,
    ])
      expect(isCssColor(value), String(value)).toBe(false);
  });
});
