import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DialogLoadFailed, lazyDialog } from './lazy-dialog.js';

describe('dialogs that load on first use', () => {
  it('DOCE-ENTRY-2.4 closes a dialog that failed to load, tells the writer, and loads it again next time', async () => {
    const load = vi
      .fn<() => Promise<(props: { onClose: () => void }) => React.ReactNode>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(() => <p>Loaded dialog</p>);
    const Dialog = lazyDialog(load);
    const failed = vi.fn();
    const onClose = vi.fn();
    const open = () => (
      <DialogLoadFailed value={failed}>
        <Suspense fallback={null}>
          <Dialog onClose={onClose} />
        </Suspense>
      </DialogLoadFailed>
    );
    const { unmount } = render(open());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(failed).toHaveBeenCalledTimes(1);
    unmount();
    render(open());
    expect(await screen.findByText('Loaded dialog')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
