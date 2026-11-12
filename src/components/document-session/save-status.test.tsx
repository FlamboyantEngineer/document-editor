import {
  UnsavedChangesGuard,
  useUnsavedChangesGuard,
} from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TelemetryAdapter } from '../../host/index.js';
import type { SessionStatus } from '../../session/status.js';
import {
  SESSION_MEASURES,
  SessionLoading,
  useSessionGuard,
  useSessionTelemetry,
} from './save-status.js';

const LOADING: SessionStatus = { load: 'loading', save: 'idle', error: null, dirty: false };

// A session whose status the test sets, with a save that keeps or leaves the changes.
function stubSession(initial: SessionStatus = LOADING, { saves = true } = {}) {
  let status = initial;
  const listeners = new Set<(status: SessionStatus) => void>();
  const setStatus = (next: Partial<SessionStatus>) =>
    act(() => {
      status = { ...status, ...next };
      for (const listener of listeners) listener(status);
    });
  const session = {
    mode: 'store' as const,
    status: {
      get: () => status,
      subscribe: (listener: (status: SessionStatus) => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    save: vi.fn(() => {
      if (saves) {
        status = { ...status, dirty: false, save: 'saved' };
        for (const listener of listeners) listener(status);
      }
      return Promise.resolve();
    }),
    hasUnsavedChanges: () => status.dirty,
  };
  return { session, setStatus };
}

type StubSession = ReturnType<typeof stubSession>['session'];

function Telemetry({ session, telemetry }: { session: StubSession; telemetry: TelemetryAdapter }) {
  useSessionTelemetry(session, telemetry);
  return null;
}

function Guarded({ session }: { session: StubSession }) {
  useSessionGuard(session, 'Sample document');
  const { confirmLeave } = useUnsavedChangesGuard();
  const [left, setLeft] = useState<boolean | null>(null);
  return (
    <>
      <button type="button" onClick={() => void confirmLeave().then(setLeft)}>
        Leave
      </button>
      <output aria-label="Left">{String(left)}</output>
    </>
  );
}

describe('SessionLoading', () => {
  it('DOCE-SESSION-9.4 names the load phase until the document is ready', () => {
    const { session, setStatus } = stubSession({ ...LOADING, load: 'connecting' });
    render(<SessionLoading session={session} labels={{ syncing: 'Catching up' }} />);
    expect(screen.getByText('Connecting')).toBeInTheDocument();
    setStatus({ load: 'loading' });
    expect(screen.getByText('Loading the document')).toBeInTheDocument();
    setStatus({ load: 'syncing' });
    expect(screen.getByText('Catching up')).toBeInTheDocument();
    setStatus({ load: 'ready' });
    expect(screen.queryByText('Catching up')).not.toBeInTheDocument();
  });

  it('DOCE-SESSION-9.4 shows nothing for a failed load', () => {
    const { session } = stubSession({ ...LOADING, load: 'failed' });
    const { container } = render(<SessionLoading session={session} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('useSessionTelemetry', () => {
  it('DOCE-SESSION-9.5 measures each load phase and the whole load', () => {
    const measure = vi.fn<TelemetryAdapter['measure']>();
    const { session, setStatus } = stubSession({ ...LOADING, load: 'connecting' });
    render(<Telemetry session={session} telemetry={{ measure }} />);
    setStatus({ load: 'loading' });
    setStatus({ load: 'ready' });
    expect(measure.mock.calls.map(([name, , attributes]) => [name, attributes])).toEqual([
      [SESSION_MEASURES.connecting, { mode: 'store' }],
      [SESSION_MEASURES.loading, { mode: 'store' }],
      [SESSION_MEASURES.load, { mode: 'store' }],
    ]);
    for (const [, duration] of measure.mock.calls) expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('DOCE-SESSION-9.5 measures nothing for a session that is already open or that failed', () => {
    const measure = vi.fn<TelemetryAdapter['measure']>();
    const { session } = stubSession({ ...LOADING, load: 'ready' });
    render(<Telemetry session={session} telemetry={{ measure }} />);
    const failing = stubSession({ ...LOADING, load: 'loading' });
    render(<Telemetry session={failing.session} telemetry={{ measure }} />);
    failing.setStatus({ load: 'failed' });
    expect(measure.mock.calls.map(([name]) => name)).toEqual([SESSION_MEASURES.loading]);
  });
});

describe('useSessionGuard', () => {
  it('DOCE-SESSION-9.6 lets the reader leave at once while nothing is unsaved', async () => {
    const user = userEvent.setup();
    const { session } = stubSession({ ...LOADING, load: 'ready' });
    render(
      <UnsavedChangesGuard shouldConfirmUnload={false}>
        <Guarded session={session} />
      </UnsavedChangesGuard>,
    );
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('true')).toBeInTheDocument();
  });

  it('DOCE-SESSION-9.6 saves the session before leaving', async () => {
    const user = userEvent.setup();
    const { session } = stubSession({ ...LOADING, load: 'ready', save: 'dirty', dirty: true });
    render(
      <UnsavedChangesGuard shouldConfirmUnload={false}>
        <Guarded session={session} />
      </UnsavedChangesGuard>,
    );
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Sample document')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('true')).toBeInTheDocument();
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('DOCE-SESSION-9.6 keeps the reader when the save leaves changes unsaved', async () => {
    const user = userEvent.setup();
    const { session } = stubSession(
      { ...LOADING, load: 'ready', save: 'dirty', dirty: true },
      { saves: false },
    );
    render(
      <UnsavedChangesGuard shouldConfirmUnload={false}>
        <Guarded session={session} />
      </UnsavedChangesGuard>,
    );
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Left')).toHaveTextContent('null');
  });
});
