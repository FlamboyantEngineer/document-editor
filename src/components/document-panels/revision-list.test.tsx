import type { Key } from '@flamboyantengineer/ui-components/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RevisionList } from './revision-list.js';

const versions = [
  { id: 'new', label: 'Latest', time: '2026-06-02T12:00:00Z', person: { name: 'Morgan' } },
  {
    id: 'old',
    label: 'Draft',
    time: '2026-06-01T12:00:00Z',
    person: { name: 'Avery' },
    children: [{ id: 'auto', time: '2026-06-01T11:00:00Z', person: { name: 'Morgan' } }],
  },
];

function History({
  onCompare,
  onRename,
  onRestore,
}: {
  onCompare?: (keys: [Key, Key]) => void;
  onRename?: (key: Key, label: string) => unknown;
  onRestore?: (key: Key) => unknown;
}) {
  const [selected, setSelected] = useState<Set<Key>>(new Set());
  return (
    <RevisionList
      aria-label="Versions"
      versions={versions}
      currentKey="new"
      selectedKeys={selected}
      onSelectionChange={setSelected}
      onCompare={onCompare}
      onRename={onRename}
      onRestore={onRestore}
    />
  );
}

describe('Editor revision composition', () => {
  it('DOCE-VERSIONS-4.6 folds automatic versions and filters by naming and author', async () => {
    const user = userEvent.setup();
    render(<History />);
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '1 earlier version under Draft' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    await user.click(screen.getByRole('switch', { name: 'Named versions only' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Versions by anyone' }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Avery' }));
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.getByRole('row', { name: /Draft/ })).toBeVisible();
  });

  it('DOCE-VERSIONS-5.2 compares selected versions in chronological order', async () => {
    const user = userEvent.setup();
    const compare = vi.fn();
    render(<History onCompare={compare} />);
    await user.click(screen.getByRole('row', { name: /Latest/ }));
    await user.click(screen.getByRole('row', { name: /Draft/ }));
    await user.click(screen.getByRole('button', { name: 'Compare versions' }));
    expect(compare).toHaveBeenCalledWith(['old', 'new']);
  });

  it('DOCE-VERSIONS-4.4 keeps a rejected rename draft and retries it', async () => {
    const user = userEvent.setup();
    const rename = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    render(<History onRename={rename} />);
    const row = screen.getByRole('row', { name: /Draft/ });
    await user.click(within(row).getByRole('button', { name: 'Version actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename version' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Offline')).toBeVisible();
    expect(name).toHaveValue('Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(rename).toHaveBeenCalledWith('old', 'Updated');
  });
  it('DOCE-VERSIONS-4.5 confirms restoration and retains a failed operation for retry', async () => {
    const user = userEvent.setup();
    const restore = vi
      .fn()
      .mockRejectedValueOnce(new Error('Restore failed'))
      .mockResolvedValue(undefined);
    render(<History onRestore={restore} />);
    expect(
      within(screen.getByRole('row', { name: /Latest/ })).queryByRole('button', {
        name: 'Version actions',
      }),
    ).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole('row', { name: /Draft/ })).getByRole('button', {
        name: 'Version actions',
      }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Restore version' }));
    expect(restore).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore Draft?' });
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    expect(await within(dialog).findByText('Restore failed')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    expect(restore).toHaveBeenCalledWith('old');
  });
});

for (const action of ['rename', 'restore'] as const) {
  for (const change of action === 'restore'
    ? ['removed', 'current', 'callback']
    : ['removed', 'callback']) {
    it(`DOCE-VERSIONS-4.4 DOCE-VERSIONS-4.5 closes a ${action} dialog when its target becomes ${change}`, async () => {
      const user = userEvent.setup();
      const rename = vi.fn();
      const restore = vi.fn();
      const props = {
        'aria-label': 'Versions',
        versions,
        currentKey: 'new',
        onSelectionChange: vi.fn(),
        onRename: rename,
        onRestore: restore,
      };
      const { rerender } = render(<RevisionList {...props} />);
      await user.click(
        within(screen.getByRole('row', { name: /Draft/ })).getByRole('button', {
          name: 'Version actions',
        }),
      );
      await user.click(
        await screen.findByRole('menuitem', {
          name: action === 'restore' ? 'Restore version' : 'Rename version',
        }),
      );
      const role = action === 'restore' ? 'alertdialog' : 'dialog';
      expect(await screen.findByRole(role)).toBeVisible();
      rerender(
        <RevisionList
          {...props}
          versions={
            change === 'removed' ? versions.filter((version) => version.id === 'new') : versions
          }
          currentKey={change === 'current' ? 'old' : 'new'}
          onRename={change === 'callback' && action === 'rename' ? undefined : rename}
          onRestore={change === 'callback' && action === 'restore' ? undefined : restore}
        />,
      );
      await waitFor(() => expect(screen.queryByRole(role)).not.toBeInTheDocument());
      expect(rename).not.toHaveBeenCalled();
      expect(restore).not.toHaveBeenCalled();
      // A transiently unavailable target must not reopen an old confirmation if it returns.
      rerender(<RevisionList {...props} />);
      expect(screen.queryByRole(role)).not.toBeInTheDocument();
    });
  }
}

it('DOCE-VERSIONS-4.5 submits an available target through the latest callback', async () => {
  const user = userEvent.setup();
  const before = vi.fn();
  const after = vi.fn();
  const props = {
    'aria-label': 'Versions',
    versions,
    currentKey: 'new',
    onSelectionChange: vi.fn(),
  };
  const { rerender } = render(<RevisionList {...props} onRestore={before} />);
  await user.click(
    within(screen.getByRole('row', { name: /Draft/ })).getByRole('button', {
      name: 'Version actions',
    }),
  );
  await user.click(await screen.findByRole('menuitem', { name: 'Restore version' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Restore Draft?' });
  rerender(<RevisionList {...props} onRestore={after} />);
  await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
  expect(before).not.toHaveBeenCalled();
  expect(after).toHaveBeenCalledWith('old');
});
