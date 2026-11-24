import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../test/projection-fixtures.js';

// The parts of the view that ProseMirror keeps internal and its focus handling sets.
interface FocusedView {
  focused: boolean;
  readonly domObserver: { flush(): void };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('projection view focus', () => {
  it('DOCE-PAGINATION-7.22 reads the browser selection after focus when a key came, and draws none of its own', () => {
    vi.useFakeTimers();
    const { projection } = mount();
    const { view } = projection;
    const own = view as unknown as FocusedView;
    view.dom.dispatchEvent(new FocusEvent('focus'));
    expect(own.focused).toBe(true);
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const flush = vi.spyOn(own.domObserver, 'flush');
    const focus = vi.spyOn(view, 'focus');
    vi.spyOn(view, 'hasFocus').mockReturnValue(true);
    vi.advanceTimersByTime(20);
    expect(flush).toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });
});
