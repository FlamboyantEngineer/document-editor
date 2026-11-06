import '@testing-library/jest-dom/vitest';
// eslint-disable-next-line testing-library/no-manual-cleanup -- Vitest runs without globals
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no Web Animations; React Aria's selection indicators read running animations. Test
// files that run in Node have no `Element` at all.
if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => [];
}

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});

// Testing Library settles each call on a zero timeout and, when it finds fake timers, advances that
// timeout through a global `jest`. Vitest's clock stands in for it so user-event runs on a fake
// clock (docs/TESTING-GUIDELINES.md). With real timers Testing Library never calls it.
Object.defineProperty(globalThis, 'jest', {
  configurable: true,
  value: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
});
