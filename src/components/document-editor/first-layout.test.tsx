import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayoutState } from '../../pagination/index.js';
import { FirstLayoutCover, useFirstLayout } from './first-layout.js';

describe('useFirstLayout', () => {
  it('DOCE-EDITOR-4.27 awaits the first settled layout, then shows the pages through later layouts', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: LayoutState }) => useFirstLayout(true, state, {}),
      { initialProps: { state: 'pending' } },
    );
    expect(result.current).toBe('awaiting');
    rerender({ state: 'settled' });
    expect(result.current).toBe('shown');
    rerender({ state: 'pending' });
    expect(result.current).toBe('shown');
    rerender({ state: 'failed' });
    expect(result.current).toBe('shown');
  });

  it('DOCE-EDITOR-4.27 fails when the first layout fails, telling the host once, and shows a later settled layout', () => {
    const onFailed = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }: { state: LayoutState }) =>
        useFirstLayout(true, state, { onLayoutFailed: onFailed }),
      { initialProps: { state: 'pending' } },
    );
    rerender({ state: 'failed' });
    expect(result.current).toBe('failed');
    rerender({ state: 'failed' });
    expect(onFailed).toHaveBeenCalledOnce();
    rerender({ state: 'settled' });
    expect(result.current).toBe('shown');
  });

  it('DOCE-EDITOR-4.27 always shows the web layout', () => {
    const { result } = renderHook(() => useFirstLayout(false, 'pending', {}));
    expect(result.current).toBe('shown');
  });
});

describe('FirstLayoutCover', () => {
  it('DOCE-EDITOR-4.27 shows an alert in place of the pages when their first layout failed', () => {
    render(
      <FirstLayoutCover
        firstLayout="failed"
        placeholder={<span>Laying out pages</span>}
        failedText="Pages failed"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pages failed');
    expect(screen.queryByText('Laying out pages')).not.toBeInTheDocument();
  });
});
